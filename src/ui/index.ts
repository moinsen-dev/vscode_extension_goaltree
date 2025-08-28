/**
 * Goal Tree UI Module
 * Exports visual system components for tree view rendering
 */

// Icon system
export { 
  TreeIcons, 
  IconUtils,
  TreeIconsCompat,
  type IconConfig, 
  type IconTheme 
} from './TreeIcons';

// Theme system
export { 
  TreeThemes, 
  ThemeUtils,
  AccessibilityUtils,
  type ColorScheme, 
  type ThemeConfig,
  type EnhancedThemeConfig,
  type ThemeChangeEvent,
  type ThemeChangeListener
} from './TreeThemes';

// Demo and testing utilities
export { 
  VisualSystemDemo, 
  visualSystemDemo 
} from './VisualSystemDemo';