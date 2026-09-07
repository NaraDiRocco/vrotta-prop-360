/**
 * Barril de las primitivas de UI (Ola 1.A del plan de diseño). Un solo
 * import (`@/components/ui/index.ts` o `@/components/ui`) para lo que antes
 * eran implementaciones ad hoc repetidas por pantalla.
 */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './button.tsx';
export { Field, type FieldProps } from './field.tsx';
export { Select, type SelectProps } from './select.tsx';
export { EmptyState, type EmptyStateProps } from './empty-state.tsx';
export { Skeleton, SkeletonRows, SkeletonCard, type SkeletonRowsProps } from './skeleton.tsx';
export { Dialog, type DialogProps } from './dialog.tsx';
export { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog.tsx';
export { ToastProvider, useToast, type ToastInput, type ToastTone } from './toast.tsx';
export { Banner, type BannerProps, type BannerTone } from './banner.tsx';
export { Pill, StatusPill, LeadStatusPill, type PillProps, type PillTone } from './pill.tsx';
export { Tabs, TabPanel, type TabsProps, type TabItem } from './tabs.tsx';
export { PageHeader, type PageHeaderProps } from './page-header.tsx';
