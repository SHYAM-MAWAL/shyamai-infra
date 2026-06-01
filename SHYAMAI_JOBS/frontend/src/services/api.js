import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  verifyEmail: (token) => api.post(`/auth/verify-email?token=${encodeURIComponent(token)}`),
  resendVerification: (email) => api.post('/auth/resend-verification', { email }),
}

export const jobsAPI = {
  list: (params) => api.get('/jobs', { params }),
  get: (id) => api.get(`/jobs/${id}`),
  create: (data) => api.post('/jobs', data),
  delete: (id) => api.delete(`/jobs/${id}`),
  save: (id) => api.post(`/jobs/${id}/save`),
  savedList: () => api.get('/jobs/user/saved'),
}

export const adminAPI = {
  stats: () => api.get('/admin/stats'),
  collectJobs: (source = 'all') => api.post('/admin/collect-jobs', null, { params: { source } }),
  runs: () => api.get('/admin/runs'),
  users: () => api.get('/admin/users'),
  expireOld: () => api.post('/admin/expire-old-jobs'),
}

export const dbAPI = {
  tables: () => api.get('/admin/db/tables'),
  tableData: (table, page = 1, perPage = 50) =>
    api.get(`/admin/db/tables/${table}`, { params: { page, per_page: perPage } }),
  updateRow: (table, id, data) => api.put(`/admin/db/tables/${table}/${id}`, { data }),
  deleteRow: (table, id) => api.delete(`/admin/db/tables/${table}/${id}`),
  query: (sql) => api.post('/admin/db/query', { sql }),
  // Users
  users: () => api.get('/admin/db/users'),
  updateUser: (id, data) => api.put(`/admin/db/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/db/users/${id}`),
  // Saved Jobs
  savedJobs: (page = 1) => api.get('/admin/db/saved-jobs', { params: { page, per_page: 50 } }),
  deleteSavedJob: (id) => api.delete(`/admin/db/saved-jobs/${id}`),
}

export default api
