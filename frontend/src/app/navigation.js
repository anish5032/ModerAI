import { CheckSquare, LayoutDashboard, ShieldCheck, Video } from 'lucide-react';
export const navigationItems = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/moderation', label: 'Moderation', icon: ShieldCheck },
    { to: '/videos', label: 'Video Library', icon: Video },
    { to: '/reviews', label: 'Review Queue', icon: CheckSquare }
];
const pageTitles = {
    '/dashboard': 'Overview',
    '/moderation': 'Moderation workspace',
    '/videos': 'Video library',
    '/reviews': 'Review queue'
};
export function getPageTitle(pathname) {
    return pageTitles[pathname] ?? 'Overview';
}
