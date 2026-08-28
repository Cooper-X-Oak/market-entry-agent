import { MoreHorizontal, Search } from 'lucide-react';

export interface TableColumn<T> { key: string; label: string; render: (row: T) => React.ReactNode; align?: 'left' | 'right' }

export function DataTable<T>({ columns, rows, getRowKey, toolbar, empty }: { columns: Array<TableColumn<T>>; rows: T[]; getRowKey: (row: T) => string; toolbar?: React.ReactNode; empty?: React.ReactNode }) {
  return <>{toolbar ?? <div className="toolbar"><div className="search-field"><Search aria-hidden="true" /><input className="input" type="search" placeholder="筛选当前列表" aria-label="筛选当前列表" /></div><div className="toolbar-spacer" /><button className="button button-secondary icon-button" aria-label="更多表格选项"><MoreHorizontal /></button></div>}<div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.key} style={{ textAlign: column.align ?? 'left' }}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={getRowKey(row)}>{columns.map((column) => <td key={column.key} style={{ textAlign: column.align ?? 'left' }}>{column.render(row)}</td>)}</tr>)}</tbody></table>{rows.length === 0 && empty}</div></>;
}
