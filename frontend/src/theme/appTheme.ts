import { createTheme } from '@mui/material/styles'
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
            backgroundColor: 'rgba(0, 229, 255, 0.12)',
            borderLeft: `3px solid ${tokens.accentPrimary}`,
            '&:hover': {
              backgroundColor: 'rgba(0, 229, 255, 0.18)',
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
  },
})
