import React, { useState, useMemo, ReactNode, useCallback } from 'react';
import { Table, TableColumn, SortDirection } from './Table';
import { Button } from '../Button/Button';
import { Skeleton } from '../Skeleton/Skeleton';
import './DataTable.css';

export interface DataTableColumn<T = any> extends TableColumn<T> {
  sortFunction?: (e: { data: T[]; order: number }) => void;
  headerStyle?: React.CSSProperties;
}

export interface DataTableProps<T = any> {
  data: T[];
  columns: DataTableColumn<T>[];
  loading?: boolean;
  paginator?: boolean;
  rows?: number;
  first?: number;
  onPageChange?: (first: number, rows: number) => void;
  selection?: T[];
  onSelectionChange?: (selection: T[]) => void;
  selectionMode?: 'single' | 'multiple' | 'checkbox';
  sortMode?: 'single' | 'multiple';
  removableSort?: boolean;
  emptyMessage?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const DataTable = <T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  paginator = false,
  rows = 10,
  first: initialFirst = 0,
  onPageChange,
  selection = [],
  onSelectionChange,
  selectionMode,
  sortMode = 'single',
  removableSort = false,
  emptyMessage = 'Нет данных',
  className = '',
  size = 'md',
}: DataTableProps<T>) => {
  const [currentPage, setCurrentPage] = useState(Math.floor(initialFirst / rows));
  const [sortColumns, setSortColumns] = useState<Map<string, SortDirection>>(new Map());

  // Обработка сортировки
  const sortedData = useMemo(() => {
    if (sortColumns.size === 0) return data;

    // Для кастомных функций сортировки создаем временный массив
    let dataToSort = [...data];
    
    // Применяем кастомные функции сортировки
    for (const [columnKey, direction] of sortColumns.entries()) {
      if (!direction) continue;

      const column = columns.find((col) => col.key === columnKey);
      if (!column || !column.sortFunction) continue;

      // Применяем кастомную функцию сортировки ко всему массиву
      const order = direction === 'asc' ? 1 : -1;
      dataToSort.sort((a, b) => {
        const tempArray = [a, b];
        column.sortFunction!({ data: tempArray, order });
        // Предполагаем, что функция сортирует массив и возвращаем результат
        if (tempArray[0] === a) return -order;
        if (tempArray[0] === b) return order;
        return 0;
      });
    }

    // Применяем стандартную сортировку для остальных колонок
    return dataToSort.sort((a, b) => {
      for (const [columnKey, direction] of sortColumns.entries()) {
        if (!direction) continue;

        const column = columns.find((col) => col.key === columnKey);
        if (!column || column.sortFunction) continue; // Пропускаем кастомные

        const aValue = column.accessor ? column.accessor(a) : a[columnKey];
        const bValue = column.accessor ? column.accessor(b) : b[columnKey];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        let comparison = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          const aStr = String(aValue).toLowerCase();
          const bStr = String(bValue).toLowerCase();
          comparison = aStr.localeCompare(bStr);
        }

        if (comparison !== 0) {
          return direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  }, [data, sortColumns, columns]);

  // Пагинация
  const paginatedData = useMemo(() => {
    if (!paginator) return sortedData;
    const start = currentPage * rows;
    return sortedData.slice(start, start + rows);
  }, [sortedData, currentPage, rows, paginator]);

  const totalPages = paginator ? Math.ceil(sortedData.length / rows) : 1;

  // Обработка выбора
  const handleSelectionChange = useCallback((row: T, checked: boolean) => {
    if (!onSelectionChange) return;

    if (selectionMode === 'single') {
      onSelectionChange(checked ? [row] : []);
    } else if (selectionMode === 'multiple' || selectionMode === 'checkbox') {
      if (checked) {
        onSelectionChange([...selection, row]);
      } else {
        onSelectionChange(selection.filter((item) => item !== row));
      }
    }
  }, [selection, selectionMode, onSelectionChange]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (!onSelectionChange) return;
    onSelectionChange(checked ? [...paginatedData] : []);
  }, [paginatedData, onSelectionChange]);

  const isRowSelected = useCallback((row: T) => {
    return selection.some((item) => item === row);
  }, [selection]);

  const isAllSelected = useMemo(() => {
    return paginatedData.length > 0 && paginatedData.every((row) => isRowSelected(row));
  }, [paginatedData, isRowSelected]);

  // Обработка сортировки
  const handleSort = useCallback((column: DataTableColumn<T>) => {
    if (!column.sortable) return;

    const currentDirection = sortColumns.get(column.key);
    let newDirection: SortDirection = 'asc';

    if (currentDirection === 'asc') {
      newDirection = 'desc';
    } else if (currentDirection === 'desc') {
      if (removableSort) {
        newDirection = null;
      } else {
        newDirection = 'asc';
      }
    }

    const newSortColumns = new Map(sortColumns);

    if (sortMode === 'single') {
      newSortColumns.clear();
    }

    if (newDirection) {
      newSortColumns.set(column.key, newDirection);
    } else {
      newSortColumns.delete(column.key);
    }

    setSortColumns(newSortColumns);
  }, [sortColumns, sortMode, removableSort]);

  // Преобразование колонок для Table
  const tableColumns: TableColumn<T>[] = useMemo(() => {
    const result: TableColumn<T>[] = [];

    // Колонка выбора
    if (selectionMode === 'multiple' || selectionMode === 'checkbox') {
      result.push({
        key: '__selection__',
        header: (
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={(e) => handleSelectAll(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        render: (_value: any, row: T) => (
          <input
            type="checkbox"
            checked={isRowSelected(row)}
            onChange={(e) => {
              e.stopPropagation();
              handleSelectionChange(row, e.target.checked);
            }}
          />
        ),
        width: '3rem',
        align: 'center',
      });
    }

    // Остальные колонки
    columns.forEach((column) => {
      result.push({
        ...column,
        sortable: column.sortable !== false,
      });
    });

    return result;
  }, [columns, selectionMode, isAllSelected, isRowSelected, handleSelectAll, handleSelectionChange]);

  // Обработка клика по строке
  const handleRowClick = useCallback((row: T) => {
    if (selectionMode) {
      handleSelectionChange(row, !isRowSelected(row));
    }
  }, [selectionMode, handleSelectionChange, isRowSelected]);

  // Навигация по страницам
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    const newFirst = page * rows;
    onPageChange?.(newFirst, rows);
  }, [rows, onPageChange]);

  if (loading) {
    return (
      <div className={`datatable-loading ${className}`}>
        <Skeleton variant="rectangular" width="100%" height={400} />
      </div>
    );
  }

  return (
    <div className={`datatable-wrapper ${className}`}>
      <Table
        data={paginatedData}
        columns={tableColumns}
        size={size}
        sortable={true}
        hoverable={true}
        emptyMessage={emptyMessage}
        onRowClick={handleRowClick}
      />

      {paginator && totalPages > 1 && (
        <div className="datatable-paginator">
          <div className="datatable-paginator-info">
            Показано {currentPage * rows + 1} - {Math.min((currentPage + 1) * rows, sortedData.length)} из {sortedData.length}
          </div>
          <div className="datatable-paginator-controls">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(0)}
              disabled={currentPage === 0}
            >
              «
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 0}
            >
              ‹
            </Button>
            <span className="datatable-paginator-page">
              Страница {currentPage + 1} из {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
            >
              ›
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(totalPages - 1)}
              disabled={currentPage >= totalPages - 1}
            >
              »
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;

