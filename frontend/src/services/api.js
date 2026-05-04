import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthEndpoint = err.config?.url?.startsWith('/auth/')
    if (err.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const login = (data) => api.post('/auth/login', data)
export const register = (data) => api.post('/auth/register', data)
export const checkUsername = (data) => api.post('/auth/check-username', data)
export const previewUsername = (data) => api.post('/auth/preview-username', data)
export const setPassword = (data) => api.post('/auth/set-password', data)
export const getMe = () => api.get('/auth/me')
export const updateProfilePicture = (data) => api.put('/auth/me/profile-picture', data)
export const removeProfilePicture = () => api.delete('/auth/me/profile-picture')
export const updateUserProfilePicture = (id, data) => api.put(`/auth/users/${id}/profile-picture`, data)
export const removeUserProfilePicture = (id) => api.delete(`/auth/users/${id}/profile-picture`)
export const deleteMe = () => api.delete('/auth/me')
export const createUser = (data) => api.post('/auth/users', data)
export const listUsers = () => api.get('/auth/users')
export const deleteUser = (id) => api.delete(`/auth/users/${id}`)
export const updateUser = (id, data) => api.put(`/auth/users/${id}`, data)

// Dashboard
export const getDashboard = () => api.get('/dashboard')

// Public share link
export const generateShareLink = (eventId) => api.post(`/events/${eventId}/share`)
export const revokeShareLink   = (eventId) => api.delete(`/events/${eventId}/share`)
export const getPublicEvent    = (token)   => api.get(`/public/events/${token}`)

// Events
export const listEvents = () => api.get('/events')
export const getEvent = (id) => api.get(`/events/${id}`)
export const createEvent = (data) => api.post('/events', data)
export const updateEvent = (id, data) => api.put(`/events/${id}`, data)
export const updateEventStatus = (id, status) => api.patch(`/events/${id}/status`, { status })
export const deleteEvent = (id) => api.delete(`/events/${id}`)

// Event members
export const getEventMembers = (eventId) => api.get(`/events/${eventId}/members`)
export const getMyEventRole = (eventId) => api.get(`/events/${eventId}/my-role`)
export const addEventMember = (eventId, data) => api.post(`/events/${eventId}/members`, data)
export const bulkAddMembers = (eventId, data) => api.post(`/events/${eventId}/members/bulk`, data)
export const updateEventMember = (eventId, userId, data) => api.put(`/events/${eventId}/members/${userId}`, data)
export const removeEventMember = (eventId, userId) => api.delete(`/events/${eventId}/members/${userId}`)

// Join requests
export const requestToJoin = (eventId, answers) => api.post(`/events/${eventId}/join-requests`, { answers })
export const getMyJoinRequest = (eventId) => api.get(`/events/${eventId}/my-join-request`)
export const getJoinRequests = (eventId) => api.get(`/events/${eventId}/join-requests`)
export const reviewJoinRequest = (eventId, userId, status) => api.patch(`/events/${eventId}/join-requests/${userId}`, { status })

// Event settings
export const updateEventSettings = (eventId, data) => api.patch(`/events/${eventId}/settings`, data)

// Role access
export const getRoleAccess    = (eventId)       => api.get(`/events/${eventId}/role-access`)
export const updateRoleAccess = (eventId, data) => api.put(`/events/${eventId}/role-access`, data)
export const resetRoleAccess  = (eventId)       => api.delete(`/events/${eventId}/role-access`)

// Games
export const listGames = (eventId) => api.get(`/events/${eventId}/games`)
export const getGame = (id) => api.get(`/games/${id}`)
export const createGame = (eventId, data) => api.post(`/events/${eventId}/games`, data)
export const updateGame = (id, data) => api.put(`/games/${id}`, data)
export const updateGameStatus = (id, status) => api.patch(`/games/${id}/status`, { status })
export const cancelGame = (id) => api.patch(`/games/${id}/cancel`)
export const deleteGame = (id) => api.delete(`/games/${id}`)

// Game participants
export const listGameParticipants = (gameId) => api.get(`/games/${gameId}/participants`)
export const createGameParticipant = (gameId, data) => api.post(`/games/${gameId}/participants`, data)

// Teams
export const listTeams = (eventId) => api.get(`/events/${eventId}/teams`)
export const getTeam = (id) => api.get(`/teams/${id}`)
export const createTeam = (eventId, data) => api.post(`/events/${eventId}/teams`, data)
export const updateTeam = (id, data) => api.put(`/teams/${id}`, data)
export const deleteTeam = (id) => api.delete(`/teams/${id}`)

// Participants
export const listParticipants = (eventId, teamId) =>
  api.get(`/events/${eventId}/participants`, { params: teamId ? { team_id: teamId } : {} })
export const createParticipant = (eventId, data) => api.post(`/events/${eventId}/participants`, data)
export const updateParticipant = (id, data) => api.put(`/participants/${id}`, data)
export const deleteParticipant = (id) => api.delete(`/participants/${id}`)

// Results
export const getGameResult = (gameId) => api.get(`/games/${gameId}/result`)
export const listEventResults = (eventId) => api.get(`/events/${eventId}/results`)
export const recordResult = (gameId, data) => api.post(`/games/${gameId}/result`, data)

export default api
