#!/usr/bin/env python3
"""실행 중인 합성 시연 서버에서 두 서류의 실제 HTTP 흐름을 확인한다.

새 합성 신청을 생성한다. 운영 환경에 실행하지 않는다. 암호와 세션은 출력하지 않는다.
"""
import copy
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('SECURITYADVISOR_TEST_BASE_URL', os.environ.get('BOAN_TEST_BASE_URL', 'http://127.0.0.1:3000')).rstrip('/')
ENVIRONMENT = {}
for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
    if line and not line.startswith('#'):
        name, _, value = line.partition('=')
        ENVIRONMENT[name] = value
RESULTS = []


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.token = None

    def request(self, method, path, data=None, expected=200, headers=None, csrf=True):
        values = dict(headers or {})
        if isinstance(data, dict):
            data = json.dumps(data, ensure_ascii=False).encode()
            values['Content-Type'] = 'application/json'
        if csrf and self.token and method != 'GET':
            values[self.token['headerName']] = self.token['token']
        request = urllib.request.Request(BASE + path, data=data, headers=values, method=method)
        try:
            response = self.opener.open(request, timeout=40)
        except urllib.error.HTTPError as error:
            response = error
        content = response.read()
        if response.status != expected:
            raise AssertionError(f'{method} {path}: expected={expected}, actual={response.status}, problem={content.decode()[:350]}')
        if 'application/json' in response.headers.get('Content-Type', '') or 'application/problem+json' in response.headers.get('Content-Type', ''):
            return json.loads(content)
        return content

    def login(self, username, role):
        self.token = self.request('GET', '/api/auth/csrf')
        form = urllib.parse.urlencode({'username': username,
            'password': ENVIRONMENT.get(f'SECURITYADVISOR_DEMO_{role}_PASSWORD', ENVIRONMENT.get(f'BOAN_DEMO_{role}_PASSWORD'))}).encode()
        session = self.request('POST', '/api/auth/login', form,
            headers={'Content-Type': 'application/x-www-form-urlencoded'})
        self.token = self.request('GET', '/api/auth/csrf')
        return session

    def multipart(self, path, fields):
        boundary = 'securityadvisor-' + uuid.uuid4().hex
        chunks = []
        for key, value in fields.items():
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n')
        chunks.append(f'--{boundary}--\r\n')
        return self.request('POST', path, ''.join(chunks).encode(),
            headers={'Content-Type': 'multipart/form-data; boundary=' + boundary})


def passed(name):
    RESULTS.append(name)
    print('PASS ' + name)


API = '/api/security-requests'
anonymous = Client()
anonymous.request('GET', API, expected=401)
clients = {}
for role in ['APPLICANT', 'SECURITY', 'INFRA', 'ADMIN']:
    client = Client()
    assert client.login(role.lower() + '.demo', role)['user']['role'] == role
    clients[role] = client
app, sec, infra, admin = (clients[x] for x in ['APPLICANT', 'SECURITY', 'INFRA', 'ADMIN'])
app.request('POST', API, {}, expected=403, csrf=False)
app.request('GET', '/api/institution/settings', expected=403)
admin.request('GET', API, expected=403)
passed('세션 로그인·CSRF·역할 경계')

others = []
for name in ['second.demo', 'outside.demo']:
    client = Client()
    client.login(name, 'APPLICANT')
    others.append(client)

VALUES = {'purpose': '공개 안내자료를 찾는 가상 서비스', 'audience': '합성 이용자',
          'dataTypes': '공개 안내 문서', 'externalTransfer': 'NO',
          'period': '2026-11-06부터 2026-12-31까지', 'dataFlow': '합성 화면에서 공개 자료 조회'}


def change(client, current, action, extra=None, expected=200):
    return client.request('POST', API + '/' + current['id'] + '/' + action,
                          dict(expectedRevision=current['revision'], **(extra or {})), expected=expected)


def patch_role(client, current, role, keys=None):
    answers = [{'key': field['key'], 'value': field['value'] or VALUES.get(field['key'], '담당자가 확인한 합성 설명'),
                'confirmed': True, 'notApplicable': False} for field in current['answers']
               if field['ownerRole'] == role and (keys is None or field['key'] in keys)]
    return client.request('PATCH', API + '/' + current['id'] + '/answers',
                          {'expectedRevision': current['revision'], 'answers': answers})


def complete_consultations(current):
    for client, role in [(infra, 'INFRA'), (sec, 'SECURITY')]:
        review = next(item for item in current['reviews'] if item['role'] == role)
        if review['status'] != 'COMPLETE':
            current = change(client, current, 'review', {'comment': '합성 자료의 분야별 협의 완료'})
    assert current['stage'] == 3 and current['status'] == 'FINAL_REVIEW'
    return current


def final_draft(current):
    response = change(app, current, 'final-draft')
    assert response['status'] == 'SUCCEEDED' and response['source'] == 'AI_INFERRED'
    assert response['confirmed'] is False and response['evidence']
    current = app.request('GET', API + '/' + current['id'])
    assert current['finalDraft']['confirmed'] is False
    app.request('POST', API + '/' + current['id'] + '/submit',
                {'expectedRevision': current['revision']}, expected=422,
                headers={'Idempotency-Key': str(uuid.uuid4())})
    return change(app, current, 'final-draft/' + response['id'] + '/confirm')


def submit(current):
    path = API + '/' + current['id'] + '/submit'
    key = str(uuid.uuid4())
    revision = current['revision']
    submitted = app.request('POST', path, {'expectedRevision': revision}, headers={'Idempotency-Key': key})
    repeated = app.request('POST', path, {'expectedRevision': revision}, headers={'Idempotency-Key': key})
    assert submitted == repeated and submitted['stage'] == 4 and submitted['status'] == 'SUBMITTED'
    return submitted


created = []
for document_type in ['FIREWALL', 'SECURITY_REVIEW']:
    current = app.request('POST', API, {
        'title': '[HTTP 합성 검증] ' + document_type, 'documentType': document_type,
        'department': '가상 검증팀', 'description': '실제 기관 정보 없이 업무 흐름을 확인하는 합성 자료입니다.'}, expected=201)
    path = API + '/' + current['id']
    for client in others:
        client.request('GET', path, expected=404)
        client.request('GET', path + '/document', expected=404)
    infra.request('GET', path, expected=404)
    app.request('POST', path + '/submit', {'expectedRevision': current['revision']},
                expected=422, headers={'Idempotency-Key': str(uuid.uuid4())})
    if document_type == 'FIREWALL':
        result = app.multipart(path + '/analysis', {'expectedRevision': current['revision'],
            'text': '사업 목적: ' + VALUES['purpose'] + '\n이용 대상: ' + VALUES['audience']})
        assert result['status'] == 'SUCCEEDED' and result['mode'] == 'EXAMPLE'
        current = change(app, current, 'analysis/' + result['id'] + '/apply')
        assert any(field['status'] == 'PROPOSED' and field['source']['kind'] == 'AI_INFERRED'
                   for field in current['answers'])
    old_revision = current['revision']
    current = patch_role(app, current, 'APPLICANT')
    conflict = app.request('PATCH', path + '/answers', {'expectedRevision': old_revision,
        'answers': [{'key': 'purpose', 'value': VALUES['purpose'], 'confirmed': True, 'notApplicable': False}]}, expected=409)
    assert conflict['latestRevision'] == current['revision']
    if document_type == 'FIREWALL':
        purpose = next(field for field in current['answers'] if field['key'] == 'purpose')
        assert purpose['source']['kind'] == 'AI_INFERRED' and purpose['confirmation']['role'] == 'APPLICANT'
    current = change(app, current, 'consult')
    assert current['stage'] == 2
    change(sec, current, 'review/start', expected=409)
    current = patch_role(infra, current, 'INFRA')
    if document_type == 'FIREWALL':
        rule = {'sourceName': '합성 화면 서버', 'sourceIp': '192.0.2.10',
                'destinationName': '합성 안내 서버', 'destinationIp': '198.51.100.20',
                'port': '443', 'protocol': 'TCP', 'direction': 'ONE_WAY',
                'startsOn': '2026-11-06', 'endsOn': '2026-12-31', 'purpose': '합성 자료 조회'}
        app.request('PUT', path + '/network', {'expectedRevision': current['revision'], 'rules': [rule]}, expected=403)
        current = infra.request('PUT', path + '/network', {'expectedRevision': current['revision'], 'rules': [rule]})
    current = change(infra, current, 'allocation', {'comment': '합성 자원 할당만 완료'})
    assert current['allocation']['status'] == 'COMPLETE'
    assert next(item for item in current['reviews'] if item['role'] == 'INFRA')['status'] != 'COMPLETE'
    current = change(sec, current, 'review/start')
    assert current['stage'] == 2
    if document_type == 'FIREWALL':
        preserved = [(f['key'], f['value']) for f in current['answers']]
        network = copy.deepcopy(current['rules'])
        current = change(infra, current, 'return', {'targetStage': 1, 'reason': '합성 사업 목적 재확인', 'fieldKeys': ['purpose']})
        assert current['stage'] == 1 and preserved == [(f['key'], f['value']) for f in current['answers']]
        assert network == current['rules'] and any(item['status'] == 'OPEN' for item in current['returnItems'])
        current = patch_role(app, current, 'APPLICANT', ['purpose'])
        current = change(app, current, 'consult')
        assert current['allocation']['status'] == 'COMPLETE'
        passed('2→1 반환: 답변·할당·통신 보존, 지정 항목 재확인')
    current = patch_role(sec, current, 'SECURITY')
    current = change(sec, current, 'supplements', {'question': '합성 자료만 사용하는지 확인해 주세요.'})
    supplement_id = current['supplements'][-1]['id']
    current = change(app, current, 'supplements/' + supplement_id + '/answer', {'answer': '모든 자료가 합성임을 확인했습니다.'})
    change(infra, current, 'supplements/' + supplement_id + '/resolve', expected=403)
    current = change(sec, current, 'supplements/' + supplement_id + '/resolve')
    current = complete_consultations(current)
    if document_type == 'FIREWALL':
        current = change(app, current, 'return', {'targetStage': 1, 'reason': '신청자가 사업 설명을 재확인', 'fieldKeys': ['purpose']})
        current = patch_role(app, current, 'APPLICANT', ['purpose'])
        current = change(app, current, 'consult')
        current = complete_consultations(current)
        current = change(app, current, 'return', {'targetStage': 2, 'reason': '보안 설명 재확인 요청', 'fieldKeys': ['accessControl']})
        assert next(item for item in current['reviews'] if item['role'] == 'INFRA')['status'] == 'COMPLETE'
        current = patch_role(sec, current, 'SECURITY', ['accessControl'])
        current = complete_consultations(current)
        passed('3→1·3→2 반환: 영향받은 확인만 재검토, 재협의 후 3단계 복귀')
    assistant = change(sec, current, 'assistant', {'question': '공개 자료 보안 검토 근거'})
    assert assistant['mode'] == 'EXAMPLE' and assistant['confirmed'] is False
    current = final_draft(current)
    assert current['blockers'] == []
    current = submit(current)
    v1 = app.request('GET', path + '/document?version=1')
    pending_final_review = change(sec, current, 'confirm', expected=409)
    assert pending_final_review['code'] == 'FINAL_REVIEWS_REQUIRED'
    assert pending_final_review['latestRevision'] == current['revision']
    if document_type == 'FIREWALL':
        current = change(infra, current, 'return', {'targetStage': 3, 'reason': '제출 후 사업 목적 재확인', 'fieldKeys': ['purpose']})
        assert current['stage'] == 3 and app.request('GET', path + '/document?version=1') == v1
        current = change(app, current, 'return', {'targetStage': 2, 'reason': '반환 항목의 담당자 재협의', 'fieldKeys': ['purpose']})
        current = patch_role(app, current, 'APPLICANT', ['purpose'])
        current = complete_consultations(current)
        current = final_draft(current)
        current = submit(current)
        assert current['submissionVersion'] == 2
        assert len(app.request('GET', path + '/submissions')) == 2
        assert app.request('GET', path + '/document?version=1') == v1
        passed('4→3 반환·재제출: 첫 제출본 불변, 새 차수와 최종 AI 확인 보존')
    saved = app.request('GET', path + '/document')
    current = change(infra, current, 'final-review', {'comment': '합성 제출본 인프라 최종 확인'})
    pending_final_review = change(infra, current, 'confirm', expected=409)
    assert pending_final_review['code'] == 'FINAL_REVIEWS_REQUIRED'
    assert pending_final_review['latestRevision'] == current['revision']
    current = change(sec, current, 'final-review', {'comment': '합성 제출본 보안 최종 확인'})
    current = change(sec, current, 'confirm')
    assert current['status'] == 'CONFIRMED' and current['stage'] == 4
    assert hashlib.sha256(saved).digest() == hashlib.sha256(app.request('GET', path + '/document')).digest()
    app.request('PATCH', path + '/answers', {'expectedRevision': current['revision'],
        'answers': [{'key': 'purpose', 'value': '변경 시도', 'confirmed': True, 'notApplicable': False}]}, expected=409)
    created.append(current)
    passed(document_type + ' 4단계·기관 격리·INFRA 선행·보완·미확정 AI 차단·멱등 제출·양측 최종 검토')

for terminal in ['withdraw', 'close']:
    current = app.request('POST', API, {'title': '[HTTP 합성 종료] ' + terminal,
        'documentType': 'SECURITY_REVIEW', 'department': '가상 검증팀', 'description': '종료 상태 보존 검사'}, expected=201)
    if terminal == 'close':
        current = patch_role(app, current, 'APPLICANT')
        current = change(app, current, 'consult')
    client = app if terminal == 'withdraw' else infra
    before = [(f['key'], f['value']) for f in current['answers']]
    change(client, current, terminal, {'reason': ''}, expected=400)
    current = change(client, current, terminal, {'reason': '합성 시나리오 종료 사유'})
    assert current['status'] == ('WITHDRAWN' if terminal == 'withdraw' else 'CLOSED')
    assert current['allowedActions'] == [] and current['terminalReason']
    assert before == [(f['key'], f['value']) for f in current['answers']]
    app.request('PATCH', API + '/' + current['id'] + '/answers', {'expectedRevision': current['revision'],
        'answers': [{'key': 'purpose', 'value': '변경 시도', 'confirmed': True, 'notApplicable': False}]}, expected=409)
passed('종결·철회 사유 필수·값 보존·종료 후 변경 거절')

settings = admin.request('GET', '/api/institution/settings')
draft = copy.deepcopy(settings['draft'])
invalid = copy.deepcopy(draft)
invalid['reviewMode'] = 'PARALLEL'
admin.request('PUT', '/api/institution/settings', {'expectedRevision': settings['revision'], 'policy': invalid}, expected=422)
draft['documentFooter'] = '합성 HTTP 검증 게시본 ' + str(uuid.uuid4())[:8]
saved = admin.request('PUT', '/api/institution/settings', {'expectedRevision': settings['revision'], 'policy': draft})
key = str(uuid.uuid4())
published = admin.request('POST', '/api/institution/settings/publish',
    {'expectedRevision': saved['revision']}, headers={'Idempotency-Key': key})
admin.request('POST', '/api/institution/settings/publish',
    {'expectedRevision': saved['revision']}, headers={'Idempotency-Key': key})
for before in created:
    after = app.request('GET', API + '/' + before['id'])
    assert after['policyVersion'] == before['policyVersion'] < published['publishedVersion']
    assert after['policy']['documentFooter'] == before['policy']['documentFooter']
passed('고정 INFRA 순서·기관 설정 멱등 게시·기존 신청 정책 버전 보존')

context = admin.request('POST', '/api/institution/contexts', {'title': '합성 운영 참고',
    'category': 'INFRASTRUCTURE', 'content': '기관 내부 사실이 아닌 합성 암호화 검증 문자열입니다.'}, expected=201)
assert context['title'] == '합성 운영 참고'
app.request('GET', '/api/institution/contexts', expected=403)
app.request('GET', '/api/institution/models', expected=403)
models = admin.request('GET', '/api/institution/models')
updated = admin.request('PUT', '/api/institution/models',
    {'expectedRevision': models['revision'], 'connections': models['connections']})
assert updated['revision'] > models['revision'] and updated['history']
knowledge = app.request('GET', '/api/knowledge/search?q=' + urllib.parse.quote('보안 소프트웨어'))
assert knowledge['embeddingMethod'] == 'LOCAL_FEATURE_HASH_256' and knowledge['fullDocumentsIndexed'] is False
assert isinstance(knowledge['results'], list)
passed('기관 컨텍스트 권한·DB 모델 설정 이력·실제 pgvector 요약 검색')

app.request('POST', '/api/auth/logout', expected=204)
app.request('GET', '/api/auth/session', expected=401)
passed('로그아웃 후 세션 폐기')
print(json.dumps({'groups': len(RESULTS), 'passed': RESULTS}, ensure_ascii=False))
