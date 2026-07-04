import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.duxdigitech.procureflow',
	appName: 'ProcureFlow',
	// Thin shell: the app loads the hosted SPA so scp deploys flow over-the-air
	// (online-only v1). webDir is just a placeholder Capacitor requires.
	webDir: 'capacitor-www',
	server: {
		url: 'https://sanskruti.duxdigitech.in/procureflow/m',
		cleartext: false,
	},
	plugins: {
		SplashScreen: {
			launchShowDuration: 1500,
			launchAutoHide: true,
			backgroundColor: '#ffffff',
			androidScaleType: 'CENTER_INSIDE',
			showSpinner: false,
		},
	},
};

export default config;
