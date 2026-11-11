interface Props {
  name: IconName
  size?: number
  className?: string
}

export type IconName =
  | 'home'
  | 'book'
  | 'layers'
  | 'chart'
  | 'settings'
  | 'search'
  | 'plus'
  | 'check'
  | 'close'
  | 'download'
  | 'print'
  | 'left'
  | 'right'
  | 'star'
  | 'refresh'
  | 'trash'
  | 'edit'
  | 'tag'
  | 'clock'
  | 'upload'
  | 'scissors'
  | 'zoom'
  | 'flag'
  | 'more'
  | 'spark'
  | 'image'

const PATHS: Record<IconName, string> = {
  home: 'M3.5 10.5 12 3.5l8.5 7M5.5 9.5V20h13V9.5',
  book: 'M4 4.5h6a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H4zM20 4.5h-6a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H20z',
  layers: 'M12 3.5 3.5 8 12 12.5 20.5 8zM3.5 12.5 12 17l8.5-4.5M3.5 16.8 12 21.3l8.5-4.5',
  chart: 'M4 20V9m5 11V4m5 16v-7m5 7V7',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.47-1 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47 1Z',
  search: 'M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6ZM15.8 15.8 20.5 20.5',
  plus: 'M12 5v14M5 12h14',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  close: 'M6 6l12 12M18 6 6 18',
  download: 'M12 3.5v11m0 0 4-4m-4 4-4-4M4.5 17v2.5h15V17',
  print: 'M7 8V3.5h10V8M7 17h10v3.5H7zM4.5 8h15v9h-15z',
  left: 'M14.5 5 8 12l6.5 7',
  right: 'M9.5 5 16 12l-6.5 7',
  star: 'M12 3.8l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 10l5.9-.9z',
  refresh: 'M20 11.5A8 8 0 0 0 6.3 6M4 12.5A8 8 0 0 0 17.7 18M4 4v4h4M20 20v-4h-4',
  trash: 'M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20h9l1-13.5M10 10v6M14 10v6',
  edit: 'M4.5 19.5h4L20 8l-4-4L4.5 15.5zM15 5l4 4',
  tag: 'M3.5 12.3V4.5h7.8l9 9-7.8 7.8zM8 8.3h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  upload: 'M12 20V9m0 0 4 4m-4-4-4 4M4.5 7V4.5h15V7',
  scissors: 'M6.5 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6.5 21.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.4 9 20 20.5M8.4 15 20 3.5',
  zoom: 'M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6ZM15.8 15.8 20.5 20.5M8 10.8h5.6M10.8 8v5.6',
  flag: 'M5 21V3.5h9l-1.2 3.5H20l-1.6 5 1.2 3.5h-8L10.4 19H5',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  image: 'M4 5.5h16v13H4zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM4 15l4.5-3.5 4 3 3-2.5L20 15',
}

export function Icon({ name, size = 18, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
