const PREFIX = 'morgendis_'

export const storage = {
    get(k, d = null) {
        try {
            const v = localStorage.getItem(PREFIX + k)
            return v ? JSON.parse(v) : d
        } catch {
            return d
        }
    },
    set(k, v) {
        try {
            localStorage.setItem(PREFIX + k, JSON.stringify(v))
        } catch {}
    }
}
