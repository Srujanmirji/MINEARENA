/// <reference types="vite/client" />

declare module 'lucide-react' {
  import { FC, SVGProps } from 'react';
  export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: string | number;
    color?: string;
    strokeWidth?: string | number;
  }
  export type Icon = FC<IconProps>;
  export const ArrowRight: Icon;
  export const Menu: Icon;
  export const X: Icon;
  export const CheckCircle2: Icon;
  export const Shield: Icon;
  export const ShieldCheck: Icon;
  export const ArrowUpRight: Icon;
  export const Copy: Icon;
  export const Check: Icon;
  export const ExternalLink: Icon;
  export const ChevronRight: Icon;
  export const BookOpen: Icon;
  export const Layers: Icon;
  export const Code: Icon;
  export const Cpu: Icon;
  export const TrendingUp: Icon;
  export const BarChart3: Icon;
  export const Database: Icon;
  export const FileText: Icon;
  export const CheckSquare: Icon;
  export const AlertTriangle: Icon;
  export const ArrowLeft: Icon;
  export const Clock: Icon;
  export const Zap: Icon;
  export const Loader2: Icon;
  export const RefreshCw: Icon;
  export const Play: Icon;
  export const Download: Icon;
}
