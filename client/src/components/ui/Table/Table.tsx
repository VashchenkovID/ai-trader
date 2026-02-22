import { useState, useMemo, ReactNode } from 'react';
import './Table.css';

export type SortDirection = 'asc' | 'desc' | null;
export type TableSize = 'sm' | 'md' | 'lg';

export interface TableColumn<T = any> {
  key: string;
  header: string | ReactNode;
  accessor?: (row: T) => any;
  sortable?: boolean;
  render?: (value: any, row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
}

export interface TableProps<T = any> {
  data: T[];
  columns: TableColumn<T>[];
  size?: TableSize;
  sortable?: boolean;
  hoverable?: boolean;
  striped?: boolean;
  bordered?: boolean;
  className?: string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  virtualized?: boolean;
  virtualHeight?: number;
  virtualRowHeight?: number;
  virtualOverscan?: number;
}

export const Table = <T extends Record<string, any>>({
  data,
  columns,
  size = 'md',
  sortable = true,
  hoverable = true,
  striped = false,
  bordered = false,
  className = '',
  onRowClick,
  emptyMessage = 'Нет данных',
  virtualized = false,
  virtualHeight = 420,
  virtualRowHeight = 56,
  virtualOverscan = 5,
}: TableProps<T>) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Сортировка данных
  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const column = columns.find((col) => col.key === sortColumn);
      if (!column) return 0;

      const aValue = column.accessor ? column.accessor(a) : a[sortColumn];
      const bValue = column.accessor ? column.accessor(b) : b[sortColumn];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });
  }, [data, sortColumn, sortDirection, columns]);

  // Обработка клика на заголовок для сортировки
  const handleSort = (column: TableColumn<T>) => {
    if (!sortable || !column.sortable) return;

    if (sortColumn === column.key) {
      // Переключение направления сортировки
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column.key);
      setSortDirection('asc');
    }
  };

  // Получение значения ячейки
  const getCellValue = (row: T, column: TableColumn<T>) => {
    if (column.accessor) {
      return column.accessor(row);
    }
    return row[column.key];
  };

  // Рендер содержимого ячейки
  const renderCell = (row: T, column: TableColumn<T>) => {
    const value = getCellValue(row, column);
    if (column.render) {
      return column.render(value, row);
    }
    return value ?? '—';
  };

  const tableClasses = [
    'table',
    `table-size-${size}`,
    hoverable && 'table-hoverable',
    striped && 'table-striped',
    bordered && 'table-bordered',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const shouldVirtualize = virtualized && sortedData.length > 0;
  const totalHeight = sortedData.length * virtualRowHeight;
  const startIndex = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / virtualRowHeight) - virtualOverscan)
    : 0;
  const visibleCount = shouldVirtualize
    ? Math.ceil(virtualHeight / virtualRowHeight) + virtualOverscan * 2
    : sortedData.length;
  const endIndex = shouldVirtualize
    ? Math.min(sortedData.length, startIndex + visibleCount)
    : sortedData.length;
  const visibleRows = shouldVirtualize ? sortedData.slice(startIndex, endIndex) : sortedData;
  const topSpacerHeight = shouldVirtualize ? startIndex * virtualRowHeight : 0;
  const bottomSpacerHeight = shouldVirtualize ? totalHeight - topSpacerHeight - visibleRows.length * virtualRowHeight : 0;

  return (
    <div
      className="table-wrapper"
      style={shouldVirtualize ? { maxHeight: virtualHeight, overflowY: 'auto' } : undefined}
      onScroll={shouldVirtualize ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
    >
      <table className={tableClasses}>
        <thead>
          <tr>
            {columns.map((column) => {
              const isSorted = sortColumn === column.key;
              const canSort = sortable && column.sortable !== false;

              return (
                <th
                  key={column.key}
                  className={`table-header ${canSort ? 'table-header-sortable' : ''} ${
                    isSorted ? `table-header-sorted-${sortDirection}` : ''
                  }`}
                  style={{
                    textAlign: column.align || 'left',
                    width: column.width,
                  }}
                  onClick={() => handleSort(column)}
                >
                  <div className="table-header-content">
                    <span>{column.header}</span>
                    {canSort && (
                      <span className="table-sort-icon">
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <span>↑</span>
                          ) : (
                            <span>↓</span>
                          )
                        ) : (
                          <span className="table-sort-icon-placeholder">⇅</span>
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            <>
              {shouldVirtualize && topSpacerHeight > 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ height: topSpacerHeight, padding: 0, border: 0 }} />
                </tr>
              )}
              {visibleRows.map((row, rowIndex) => (
              <tr
                key={shouldVirtualize ? startIndex + rowIndex : rowIndex}
                className={`${onRowClick ? 'table-row-clickable' : ''} ${hoverable ? 'table-hoverable-row' : ''}`}
                onClick={() => onRowClick?.(row)}
                style={{
                  animationDelay: shouldVirtualize ? undefined : `${rowIndex * 0.05}s`,
                  animationFillMode: shouldVirtualize ? undefined : 'both',
                  height: shouldVirtualize ? virtualRowHeight : undefined
                }}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="table-cell"
                    style={{
                      textAlign: 'left',
                    }}
                  >
                    {renderCell(row, column)}
                  </td>
                ))}
              </tr>
              ))}
              {shouldVirtualize && bottomSpacerHeight > 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ height: bottomSpacerHeight, padding: 0, border: 0 }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Table;
