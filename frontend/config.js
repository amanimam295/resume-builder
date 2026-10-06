// API lives on the same origin as this page — works locally (http://localhost:5000)
// and in production (https://your-domain.com) with no changes.
// Hosting the frontend separately? Set window.API_BASE to the full API URL
// (e.g. 'https://your-api.onrender.com/api') in a script BEFORE this file.
window.API_BASE = window.API_BASE || '/api';
