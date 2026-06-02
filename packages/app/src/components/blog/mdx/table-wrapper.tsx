export function TableWrapper(props: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-scroll">
      <table {...props} />
    </div>
  );
}
