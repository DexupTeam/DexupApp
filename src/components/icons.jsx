// Icônes de Dexup, en matrice de points (même nom et mêmes réglages que lucide-react, qu'elles remplacent).
// Chaque icône est une grille de 9 × 9 : « x » = un point, « . » = vide. Le dessin se lit directement
// ici ; pour en ajouter une, dessiner sa grille et l'exporter en bas du fichier.
import { forwardRef } from 'react';

// Rayon d'un point (1 = écart entre deux points) : plus gros sur les petites icônes pour qu'elles restent
// lisibles, et presque jointifs quand l'icône est demandée en gras (strokeWidth ≥ 2,5, comme lucide).
const radius = (size, strokeWidth) => (strokeWidth >= 2.5 ? 0.5 : size <= 16 ? 0.47 : size <= 20 ? 0.44 : 0.4);

const GRIDS = {
  ArrowDownUp: `
    ..x...x..
    ..x..xxx.
    ..x.x.x.x
    ..x...x..
    ..x...x..
    ..x...x..
    x.x.x.x..
    .xxx..x..
    ..x...x..`,
  ArrowUpRight: `
    .........
    ..xxxxxx.
    ......xx.
    .....x.x.
    ....x..x.
    ...x...x.
    ..x....x.
    .x.......
    .........`,
  BadgeCheck: `
    ..xxxxx..
    .x.....x.
    x.......x
    x.....x.x
    x....x..x
    x.x.x...x
    x..x....x
    .x.....x.
    ..xxxxx..`,
  BookMarked: `
    xxxxxxxxx
    x..x.x..x
    x..x.x..x
    x...x...x
    x.......x
    x.......x
    xxxxxxxxx
    x.......x
    .xxxxxxxx`,
  BookOpen: `
    .........
    xxx...xxx
    x..x.x..x
    x...x...x
    x...x...x
    x...x...x
    x...x...x
    xxx.x.xxx
    ...xxx...`,
  Boxes: `
    ..xxxxx..
    ..x...x..
    ..x...x..
    ..xxxxx..
    .........
    xxxx.xxxx
    x..x.x..x
    x..x.x..x
    xxxx.xxxx`,
  CalendarDays: `
    ..x...x..
    xxxxxxxxx
    x.......x
    xxxxxxxxx
    x.......x
    x.x.x.x.x
    x.......x
    x.x.x.x.x
    xxxxxxxxx`,
  Camera: `
    ...xxx...
    xxx...xxx
    x.......x
    x..xxx..x
    x.x...x.x
    x.x...x.x
    x..xxx..x
    x.......x
    xxxxxxxxx`,
  CameraOff: `
    x..xxx...
    xxx...xxx
    x.x.....x
    x..xxx..x
    x.x.x.x.x
    x.x..xx.x
    x..xxxx.x
    x......xx
    xxxxxxxxx`,
  Check: `
    .........
    .........
    ........x
    .......x.
    x.....x..
    .x...x...
    ..x.x....
    ...x.....
    .........`,
  ChevronDown: `
    .........
    .........
    .x.....x.
    ..x...x..
    ...x.x...
    ....x....
    .........
    .........
    .........`,
  ChevronLeft: `
    .........
    .....x...
    ....x....
    ...x.....
    ..x......
    ...x.....
    ....x....
    .....x...
    .........`,
  ChevronRight: `
    .........
    ...x.....
    ....x....
    .....x...
    ......x..
    .....x...
    ....x....
    ...x.....
    .........`,
  Clock: `
    ..xxxxx..
    .x.....x.
    x...x...x
    x...x...x
    x...xxx.x
    x.......x
    x.......x
    .x.....x.
    ..xxxxx..`,
  CloudUpload: `
    ..xxx....
    .x...xx..
    x......x.
    x.......x
    .xxx.xxx.
    ....x....
    ...x.x...
    ....x....
    ....x....`,
  Ellipsis: `
    .........
    .........
    .........
    .........
    x...x...x
    .........
    .........
    .........
    .........`,
  ExternalLink: `
    .....xxxx
    xxx....xx
    x.....x.x
    x....x..x
    x...x....
    x.......x
    x.......x
    x.......x
    xxxxxxxxx`,
  Eye: `
    .........
    .........
    ..xxxxx..
    .x.....x.
    x..xxx..x
    .x.....x.
    ..xxxxx..
    .........
    .........`,
  Gift: `
    ..x...x..
    ...x.x...
    xxxxxxxxx
    x...x...x
    xxxxxxxxx
    .x..x..x.
    .x..x..x.
    .x..x..x.
    .xxxxxxx.`,
  Heart: `
    .........
    .xx...xx.
    x..x.x..x
    x...x...x
    x.......x
    .x.....x.
    ..x...x..
    ...x.x...
    ....x....`,
  Home: `
    ....x....
    ...x.x...
    ..x...x..
    .x.....x.
    xx.....xx
    .x.....x.
    .x.xxx.x.
    .x.x.x.x.
    .xxx.xxx.`,
  ImagePlus: `
    .......x.
    ......xxx
    xxxxx..x.
    x.......x
    x.xx....x
    x.xx....x
    x....x..x
    x...x.x.x
    xxxxxxxxx`,
  ImageUp: `
    .......x.
    ......x.x
    xxxxx..x.
    x.......x
    x.xx....x
    x.xx....x
    x....x..x
    x...x.x.x
    xxxxxxxxx`,
  Keyboard: `
    .........
    xxxxxxxxx
    x.......x
    x.x.x.x.x
    x.......x
    x.xxxxx.x
    x.......x
    xxxxxxxxx
    .........`,
  Languages: `
    ..xxxxx..
    .x..x..x.
    x..x.x..x
    x..x.x..x
    xxxxxxxxx
    x..x.x..x
    x..x.x..x
    .x..x..x.
    ..xxxxx..`,
  Layers: `
    ..xxxxxxx
    ..x.....x
    xxxxxxx.x
    x.....x.x
    x.....x.x
    x.....x.x
    x.....xxx
    x.....x..
    xxxxxxx..`,
  LayoutGrid: `
    xxxx.xxxx
    x..x.x..x
    x..x.x..x
    xxxx.xxxx
    .........
    xxxx.xxxx
    x..x.x..x
    x..x.x..x
    xxxx.xxxx`,
  ListChecks: `
    ...x.....
    x.x..xxxx
    .x.......
    .........
    ...x.....
    x.x..xxxx
    .x.......
    .........
    .....xxxx`,
  ListPlus: `
    .........
    xxxxxxx..
    .........
    xxxxxxx..
    .........
    xxxx...x.
    ......xxx
    xxxx...x.
    .........`,
  Lock: `
    ..xxxxx..
    .x.....x.
    .x.....x.
    xxxxxxxxx
    x.......x
    x...x...x
    x...x...x
    x.......x
    xxxxxxxxx`,
  LogOut: `
    xxxx.....
    x........
    x.....x..
    x......x.
    x..xxxxxx
    x......x.
    x.....x..
    x........
    xxxx.....`,
  MapPin: `
    ..xxxxx..
    .x.....x.
    x...x...x
    x..x.x..x
    x...x...x
    .x.....x.
    ..x...x..
    ...x.x...
    ....x....`,
  Minus: `
    .........
    .........
    .........
    .........
    xxxxxxxxx
    .........
    .........
    .........
    .........`,
  MinusCircle: `
    ..xxxxx..
    .x.....x.
    x.......x
    x.......x
    x.xxxxx.x
    x.......x
    x.......x
    .x.....x.
    ..xxxxx..`,
  Newspaper: `
    xxxxxxxxx
    x.......x
    x.xxx.x.x
    x.xxx.x.x
    x.......x
    x.xxxxx.x
    x.......x
    x.xxxxx.x
    xxxxxxxxx`,
  Package: `
    .xxxxxxx.
    x...x...x
    xxxxxxxxx
    x.......x
    x..xxx..x
    x.......x
    x.......x
    x.......x
    xxxxxxxxx`,
  Pencil: `
    ......xx.
    .....x..x
    ....x..x.
    ...x..x..
    ..x..x...
    .x..x....
    x..x.....
    x.x......
    xx.......`,
  Plus: `
    ....x....
    ....x....
    ....x....
    ....x....
    xxxxxxxxx
    ....x....
    ....x....
    ....x....
    ....x....`,
  Rows3: `
    .........
    xxxxxxxxx
    .........
    .........
    xxxxxxxxx
    .........
    .........
    xxxxxxxxx
    .........`,
  ScanLine: `
    xxx...xxx
    x.......x
    x.......x
    .........
    xxxxxxxxx
    .........
    x.......x
    x.......x
    xxx...xxx`,
  Search: `
    ..xxx....
    .x...x...
    x.....x..
    x.....x..
    x.....x..
    .x...x...
    ..xxx.x..
    .......x.
    ........x`,
  SearchX: `
    ..xxx....
    .x...x...
    x.x.x.x..
    x..x..x..
    x.x.x.x..
    .x...x...
    ..xxx.x..
    .......x.
    ........x`,
  Share2: `
    .......x.
    ......x.x
    .....x.x.
    .x.xx....
    x.x......
    .x.xx....
    .....x.x.
    ......x.x
    .......x.`,
  ShoppingBag: `
    ...xxx...
    ..x...x..
    xxxxxxxxx
    x.......x
    x.......x
    x.......x
    x.......x
    x.......x
    .xxxxxxx.`,
  Sparkles: `
    ...x.....
    ...x.....
    ..x.x....
    xx...xx..
    ..x.x....
    ...x...x.
    ...x..x.x
    .......x.
    .........`,
  Star: `
    ....x....
    ...x.x...
    xxx...xxx
    .x.....x.
    ..x...x..
    ..x...x..
    .x..x..x.
    .x.x.x.x.
    .xx...xx.`,
  SwitchCamera: `
    ...xxx...
    xxx...xxx
    x.......x
    x..x....x
    x.xxxxx.x
    x..x.x..x
    x.xxxxx.x
    x....x..x
    xxxxxxxxx`,
  Trash2: `
    ...xxx...
    xxxxxxxxx
    .x.....x.
    .x.x.x.x.
    .x.x.x.x.
    .x.x.x.x.
    .x.....x.
    .x.....x.
    ..xxxxx..`,
  Trophy: `
    xxxxxxxxx
    x.x...x.x
    x.x...x.x
    .xx...xx.
    ..x...x..
    ...xxx...
    ....x....
    ....x....
    ..xxxxx..`,
  UserCheck: `
    .xxx.....
    x...x...x
    x...xx.x.
    .xxx..x..
    .........
    .xxx.....
    x...x....
    x...x....
    x...x....`,
  UserPlus: `
    .xxx.....
    x...x....
    x...x..x.
    .xxx..xxx
    .......x.
    .xxx.....
    x...x....
    x...x....
    x...x....`,
  Users: `
    ...xxx...
    ..x...x..
    ..x...x..
    ...xxx...
    .........
    ..xxxxx..
    .x.....x.
    x.......x
    x.......x`,
  WifiOff: `
    x........
    .xxxxxxx.
    x.x.....x
    ..xxxxx..
    .x..x..x.
    ...xxx...
    ..x...x..
    .......x.
    ....x...x`,
  X: `
    x.......x
    .x.....x.
    ..x...x..
    ...x.x...
    ....x....
    ...x.x...
    ..x...x..
    .x.....x.
    x.......x`,
  StarFilled: `
    ....x....
    ...xxx...
    xxxxxxxxx
    .xxxxxxx.
    ..xxxxx..
    ..xxxxx..
    .xxxxxxx.
    .xxx.xxx.
    .xx...xx.`,
  HeartFilled: `
    .........
    .xx...xx.
    xxxx.xxxx
    xxxxxxxxx
    xxxxxxxxx
    .xxxxxxx.
    ..xxxxx..
    ...xxx...
    ....x....`,
};

function toPath(grid, R) {
  let d = '';
  grid.trim().split('\n').forEach((row, y) => {
    [...row.trim()].forEach((c, x) => {
      if (c === 'x') d += `M${x + 0.5 - R} ${y + 0.5}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0`;
    });
  });
  return d;
}

// `fill` (lucide : fill="currentColor") choisit la version pleine quand elle existe (étoile, cœur).
function dotIcon(name) {
  const paths = {}; // tracés déjà calculés, par grille et rayon
  const path = (grid, R) => (paths[`${grid}:${R}`] ||= toPath(GRIDS[grid], R));
  const Icon = forwardRef(function DotIcon(
    { size = 24, color = 'currentColor', fill, strokeWidth, absoluteStrokeWidth: _a, className, ...rest }, ref,
  ) {
    const R = radius(size, strokeWidth);
    const grid = fill && fill !== 'none' && GRIDS[`${name}Filled`] ? `${name}Filled` : name;
    const labelled = rest['aria-label'] || rest['aria-labelledby'] || rest.role;
    return (
      <svg
        ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="-0.25 -0.25 9.5 9.5"
        fill={color} className={className ? `dot-icon ${className}` : 'dot-icon'}
        aria-hidden={labelled ? undefined : 'true'} focusable="false" {...rest}
      >
        <path d={path(grid, R)} />
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

export const ArrowDownUp = dotIcon('ArrowDownUp');
export const ArrowUpRight = dotIcon('ArrowUpRight');
export const BadgeCheck = dotIcon('BadgeCheck');
export const BookMarked = dotIcon('BookMarked');
export const BookOpen = dotIcon('BookOpen');
export const Boxes = dotIcon('Boxes');
export const CalendarDays = dotIcon('CalendarDays');
export const Camera = dotIcon('Camera');
export const CameraOff = dotIcon('CameraOff');
export const Check = dotIcon('Check');
export const ChevronDown = dotIcon('ChevronDown');
export const ChevronLeft = dotIcon('ChevronLeft');
export const ChevronRight = dotIcon('ChevronRight');
export const Clock = dotIcon('Clock');
export const CloudUpload = dotIcon('CloudUpload');
export const Ellipsis = dotIcon('Ellipsis');
export const ExternalLink = dotIcon('ExternalLink');
export const Eye = dotIcon('Eye');
export const Gift = dotIcon('Gift');
export const Heart = dotIcon('Heart');
export const Home = dotIcon('Home');
export const ImagePlus = dotIcon('ImagePlus');
export const ImageUp = dotIcon('ImageUp');
export const Keyboard = dotIcon('Keyboard');
export const Languages = dotIcon('Languages');
export const Layers = dotIcon('Layers');
export const LayoutGrid = dotIcon('LayoutGrid');
export const ListChecks = dotIcon('ListChecks');
export const ListPlus = dotIcon('ListPlus');
export const Lock = dotIcon('Lock');
export const LogOut = dotIcon('LogOut');
export const MapPin = dotIcon('MapPin');
export const Minus = dotIcon('Minus');
export const MinusCircle = dotIcon('MinusCircle');
export const Newspaper = dotIcon('Newspaper');
export const Package = dotIcon('Package');
export const Pencil = dotIcon('Pencil');
export const Plus = dotIcon('Plus');
export const Rows3 = dotIcon('Rows3');
export const ScanLine = dotIcon('ScanLine');
export const Search = dotIcon('Search');
export const SearchX = dotIcon('SearchX');
export const Share2 = dotIcon('Share2');
export const ShoppingBag = dotIcon('ShoppingBag');
export const Sparkles = dotIcon('Sparkles');
export const Star = dotIcon('Star');
export const SwitchCamera = dotIcon('SwitchCamera');
export const Trash2 = dotIcon('Trash2');
export const Trophy = dotIcon('Trophy');
export const UserCheck = dotIcon('UserCheck');
export const UserPlus = dotIcon('UserPlus');
export const Users = dotIcon('Users');
export const WifiOff = dotIcon('WifiOff');
export const X = dotIcon('X');
