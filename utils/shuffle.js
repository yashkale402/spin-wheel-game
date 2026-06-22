/**
 * utils/shuffle.js
 * ----------------
 * Implements the Fisher-Yates (Knuth) shuffle algorithm.
 * Used to generate a random elimination order for wheel participants.
 */

/**
 * Shuffles an array in-place and returns it.
 * @param {any[]} array - Array to shuffle
 * @returns {any[]} The same array, shuffled
 */
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        // Pick a random index from 0 to i (inclusive)
        const j = Math.floor(Math.random() * (i + 1));
        // Swap elements at i and j
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = { shuffle };
