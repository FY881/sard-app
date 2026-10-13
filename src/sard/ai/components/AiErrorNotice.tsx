import type { ThemeColors } from '@theme/types';
import { AI_STRINGS } from '../strings';
import { Notice } from './ui';
import type { AiTaskError } from './useAiTask';

/** Error card; offers AI settings when the fix lives there (no key, …). */
const AiErrorNotice = ({
  theme,
  error,
  onOpenSettings,
  onRetry,
}: {
  theme: ThemeColors;
  error: AiTaskError;
  onOpenSettings?: () => void;
  onRetry?: () => void;
}) => {
  if (error.code === 'NO_KEY') {
    return (
      <Notice
        theme={theme}
        icon="key-variant"
        title={AI_STRINGS.noKey.title}
        body={AI_STRINGS.noKey.body}
        actionLabel={onOpenSettings ? AI_STRINGS.noKey.action : undefined}
        onAction={onOpenSettings}
      />
    );
  }
  return (
    <Notice
      theme={theme}
      tone="error"
      icon="alert-circle-outline"
      title={error.message}
      actionLabel={
        error.needsSettings && onOpenSettings
          ? AI_STRINGS.common.settings
          : onRetry
          ? AI_STRINGS.common.retry
          : undefined
      }
      onAction={error.needsSettings ? onOpenSettings : onRetry}
    />
  );
};

export default AiErrorNotice;
