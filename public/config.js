window.__CONFIG__ = {
  // The URL for the CORS proxy, the URL must NOT end with a slash!
  // If not specified, the onboarding will not allow a "default setup". The user will have to use the extension or set up a proxy themselves
  VITE_CORS_PROXY_URL: "",

  // The READ API key to access TMDB
  VITE_TMDB_READ_API_KEY: "",

  // The DMCA email displayed in the footer, null to hide the DMCA link
  VITE_DMCA_EMAIL: null,

  // Whether to disable hash-based routing, leave this as false if you don't know what this is
  VITE_NORMAL_ROUTER: false,

  // The backend URL to communicate with
  VITE_BACKEND_URL: null,

  // Jellyfin integration
  VITE_JELLYFIN_SERVER_URL: null,
  VITE_JELLYFIN_USERNAME: null,
  VITE_JELLYFIN_PASSWORD: null,
  VITE_JELLYFIN_TOKEN: null,
  VITE_JELLYFIN_USER_ID: null,

  // A comma separated list of disallowed IDs in the case of a DMCA claim - in the format "series-<id>" and "movie-<id>"
  VITE_DISALLOWED_IDS: "",
};
