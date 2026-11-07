import type { ThemeConfig } from 'antd';

/** Bảng màu "Phiếu số": giấy, mực, mực dấu; cảnh báo dùng màu hổ phách, không dùng đỏ. */
export const C = {
  paper: '#F4F6F7',
  ink: '#1E2638',
  stamp: '#3A3FB0',
  stampSoft: '#E6E7F7',
  good: '#2E7A57',
  goodSoft: '#E3F1EA',
  amber: '#B4690E',
  amberSoft: '#FBEFDD',
  line: '#D5DBE1',
  muted: '#5E6878',
  faint: '#A7AFBA',
  seg: '#E4E8EC',
} as const;

export const SANS = "'Be Vietnam Pro', 'Segoe UI', system-ui, -apple-system, sans-serif";
export const NUM = "'Barlow Condensed', 'Be Vietnam Pro', sans-serif";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: C.stamp,
    colorInfo: C.stamp,
    colorSuccess: C.good,
    colorWarning: C.amber,
    colorError: C.amber,
    colorText: C.ink,
    colorTextSecondary: C.muted,
    colorTextTertiary: C.faint,
    colorBorder: C.line,
    colorBorderSecondary: '#E6EAEE',
    colorBgLayout: C.paper,
    colorLink: C.stamp,
    // Nền và viền nhạt cho Tag/Alert theo bảng màu (để antd tự sinh thì ra màu đục)
    colorSuccessBg: C.goodSoft,
    colorSuccessBorder: '#BFDCCB',
    colorWarningBg: C.amberSoft,
    colorWarningBorder: '#EED3AC',
    colorErrorBg: C.amberSoft,
    colorErrorBorder: '#EED3AC',
    colorInfoBg: C.stampSoft,
    colorInfoBorder: '#C9CBEE',
    borderRadius: 10,
    fontFamily: SANS,
  },
  components: {
    Button: { primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none', fontWeight: 600 },
    Menu: { itemSelectedBg: C.stampSoft, itemSelectedColor: C.stamp, itemBorderRadius: 10, itemColor: C.ink },
    Layout: { siderBg: '#FFFFFF', headerBg: '#FFFFFF', bodyBg: C.paper },
    Table: { headerBg: '#FAFBFC', headerColor: C.muted, rowHoverBg: '#F7F8FA' },
    Card: { headerFontSize: 16 },
    Tag: { defaultBg: C.seg, defaultColor: C.muted },
  },
};
