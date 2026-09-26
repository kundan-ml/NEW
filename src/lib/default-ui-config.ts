import bundledPreferences from '../../config/ui-preferences.json';
import type {UiPreferences} from '@/components/UIProvider';

/**
 * The appearance committed with the application is the production baseline.
 * Importing it statically ensures Next/Vercel includes it in the server bundle;
 * relying only on process.cwd() can otherwise produce a different fallback UI.
 */
export function getDefaultUiPreferences():Partial<UiPreferences>{
  const preferences=structuredClone(bundledPreferences) as unknown as Partial<UiPreferences>;
  return {
    ...preferences,
    theme:preferences.theme||'pdf-skeleton',
    manualSkeleton:preferences.manualSkeleton??true,
  };
}
