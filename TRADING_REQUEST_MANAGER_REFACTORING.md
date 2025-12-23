# Рефакторинг TradingRequestManager.tsx

## Статус: В процессе

### Выполнено:
- ✅ Заменены импорты на UI-kit компоненты
- ✅ Заменены Badge функции (getStatusBadge, getPriorityBadge, getRiskBadge, getTradingModeBadge)
- ✅ Заменен toolbarTemplate на UI-kit компоненты
- ✅ Заменен Card на UI-kit Card
- ✅ Создан TabView компонент для UI-kit
- ✅ Заменен TabView/TabPanel на UI-kit TabView
- ✅ Заменен Message на Alert
- ✅ Созданы компоненты: DataTable, Toolbar, SplitButton, ConfirmDialog

### Осталось:
- ⏳ Заменить DataTable (PrimeReact) на DataTable (UI-kit) - преобразовать Column компоненты в массив columns
- ⏳ Заменить Dialog на Modal
- ⏳ Заменить InputTextarea на Input (textarea)
- ⏳ Исправить actionBodyTemplate для SplitButton (size="small" -> size="sm")
- ⏳ Обновить ConfirmDialog использование

### Примечания:
- DataTable из PrimeReact использует Column компоненты как children
- DataTable из UI-kit использует массив columns
- Нужно преобразовать все Column компоненты в массив DataTableColumn

