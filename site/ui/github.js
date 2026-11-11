// Addresses on GitHub: a page, and the avatar of a person. Shared by the dashboard (ui/links.js) and the year in review,
// which loads nothing else of the dashboard.

/** @type {(path: string) => string} */
export const githubUrl = (path) => `https://github.com/${path}`
// GitHub serves the avatar at twice its displayed size, for sharp high-density screens.
/** @type {(login: string, size?: number) => string} */
export const avatarUrl = (login, size = 48) => githubUrl(`${encodeURIComponent(login)}.png?size=${size}`)
