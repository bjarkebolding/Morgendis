export function getWindDirection(deg) {
    return ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'][Math.round(deg / 45) % 8]
}

export function getWindArrow(deg) {
    return ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'][Math.round(deg / 45) % 8]
}
