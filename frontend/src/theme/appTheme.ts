import { alpha, createTheme } from '@mui/material/styles'
import { tokens } from './tokens'

export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: tokens.accentPrimary },
    secondary: { main: tokens.accentSecondary },
    background: {
      default: tokens.bg,
      paper: tokens.surface,
    },
    text: {
      primary: '#ffffff',
      secondary: tokens.textMuted,
    },
    divider: tokens.borderSubtle,
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: `${tokens.borderSubtle} transparent`,
          backgroundColor: tokens.bg,
          backgroundImage: `
            radial-gradient(ellipse 85% 55% at 50% -15%, ${alpha(tokens.accentPrimary, 0.09)}, transparent 55%),
            radial-gradient(ellipse 50% 45% at 100% 40%, ${alpha(tokens.accentSecondary, 0.06)}, transparent 50%),
            radial-gradient(ellipse 45% 35% at 0% 85%, ${alpha(tokens.accentPrimary, 0.05)}, transparent 45%)
          `,
          backgroundAttachment: 'fixed',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 999,
          fontWeight: 600,
        },
        contained: {
          '&.MuiButton-containedPrimary': {
            borderRadius: 8,
            color: tokens.buttonOnPrimaryText,
            backgroundColor: tokens.accentPrimary,
            '&:hover': {
              backgroundColor: alpha(tokens.accentPrimary, 0.88),
            },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${tokens.borderSubtle}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.surfaceElevated,
          borderRight: `1px solid ${tokens.borderSubtle}`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          marginBottom: 2,
          '&.Mui-selected': {
            backgroundColor: alpha(tokens.accentPrimary, 0.12),
            borderLeft: `3px solid ${tokens.accentPrimary}`,
            '&:hover': {
              backgroundColor: alpha(tokens.accentPrimary, 0.18),
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.surfaceElevated,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: tokens.borderSubtle,
        },
        head: {
          backgroundColor: tokens.surfaceElevated,
          fontWeight: 600,
          fontSize: '0.8125rem',
          letterSpacing: '0.02em',
          color: tokens.textMuted,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
        },
        sizeSmall: {
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 10,
          paddingRight: 10,
        },
      },
    },
    MuiTableBody: {
      styleOverrides: {
        root: ({ theme }) => ({
          '& .MuiTableRow-root:hover': {
            backgroundColor: theme.palette.action.hover,
          },
        }),
      },
    },
  },
})
