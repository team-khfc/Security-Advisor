import { Icon } from './Icon';

/** 서버의 전체 건수를 기준으로 현재 페이지와 이동 버튼을 표시한다. */
export function ListPager({
  page,
  size,
  total,
  onChange,
  label = '목록 페이지',
}: {
  page: number;
  size: number;
  total: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav className="pager" aria-label={label}>
      <button
        className="btn btn-tertiary"
        disabled={page === 0}
        onClick={() => onChange(0)}
        aria-label="처음 페이지"
      >
        <Icon name="chevronLeft" />
      </button>
      <button className="btn btn-tertiary" disabled={page === 0} onClick={() => onChange(page - 1)}>
        이전
      </button>
      <span role="status">
        전체 {total}건 · {page + 1} / {pages}페이지
      </span>
      <button
        className="btn btn-tertiary"
        disabled={page + 1 >= pages}
        onClick={() => onChange(page + 1)}
      >
        다음
      </button>
      <button
        className="btn btn-tertiary"
        disabled={page + 1 >= pages}
        onClick={() => onChange(pages - 1)}
        aria-label="마지막 페이지"
      >
        <Icon name="chevronRight" />
      </button>
    </nav>
  );
}
