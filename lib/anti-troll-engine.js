// ============================================================================
// ZIFLIX ANTI-TROLL & INTELLIGENT OBFUSCATION DETECTION ENGINE
// Détection malléable : Leetspeak, accents, ponctuation, homoglyphes, répétitions
// et variantes phonétiques du nom de l'administrateur et des insultes
// ============================================================================

const LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '|': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '6': 'b',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g'
};

// Mots-clés d'identité protégée (variantes de Mohamed Djiedju / Diedhiou)
const ADMIN_FIRSTNAMES = ['mohamed', 'mohamad', 'mouhamed', 'mouhamad', 'mohammed', 'muhammad', 'momo', 'moh', 'mouh'];
const ADMIN_LASTNAMES = ['djiedju', 'diedhiou', 'diedjou', 'djedjou', 'djiedjou', 'diedu', 'djiedu', 'djedju', 'djieju', 'dieju', 'jiedju', 'jiedjou', 'diedio', 'djiedio'];

// Mots-clés injurieux / insultes
const INSULT_KEYWORDS = [
  'pute', 'putes', 'putain', 'salope', 'salopes', 'salop', 'salops',
  'fdp', 'filsdepute', 'nique', 'niquer', 'niquetamer', 'niquetamere', 'niquetesmorts',
  'ntm', 'connard', 'connards', 'connasse', 'connasses', 'encule', 'encules', 'enculer',
  'batard', 'batards', 'clochard', 'clochards', 'esclave', 'esclaves', 'suceur', 'suceurs',
  'suceuse', 'merde', 'merdes', 'pd', 'tapette', 'triso', 'mongolien', 'tagueule', 'tg',
  'nazi', 'bougnoul', 'negre', 'sale'
];

/**
 * Normalise une chaîne pour révéler les subterfuges :
 * 1. Décomposition Unicode pour retirer les accents
 * 2. Remplacement leetspeak
 * 3. Compression des caractères répétés
 * 4. Extraction d'une version condensée sans séparateur
 */
function normalizeForTrollCheck(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return { spaced: '', condensed: '', original: '' };

  const original = rawStr.trim();
  
  // 1. Minuscules + suppression des accents (é -> e, etc.)
  let s = original.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 2. Conversion leetspeak (chiffres et symboles vers lettres)
  let leetConverted = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    leetConverted += LEET_MAP[ch] || ch;
  }

  // 3. Compression des lettres répétées (ex: puuuuute -> pute, mmooohamed -> mohamed)
  // Ne garde que 1 occurrence si 3+ répétitions consécutives
  const compressed = leetConverted.replace(/(.)\1{2,}/g, '$1');

  // 4. Forme condensée : uniquement les lettres [a-z0-9]
  const condensed = compressed.replace(/[^a-z0-9]/g, '');

  // 5. Version avec espaces normalisés
  const spaced = compressed.replace(/[^a-z0-9]+/g, ' ').trim();

  return {
    original,
    condensed,
    spaced
  };
}

/**
 * Calcule la distance de Levenshtein simple pour fuzzy matching
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Analyse un texte (pseudonyme ou commentaire) pour détecter un comportement troll
 * Renvoie un objet d'évaluation
 */
function checkTrollContent(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { isBlocked: false };
  }

  const { original, condensed, spaced } = normalizeForTrollCheck(rawText);
  if (!condensed || condensed.length < 2) {
    return { isBlocked: false };
  }

  // A. VÉRIFICATION USURPATION DU NOM DE L'ADMINISTRATEUR (Mohamed Djiedju / Diedhiou)
  // 1. Détection directe du nom de famille spécifique (Djiedju / Diedhiou / etc.)
  for (const lastname of ADMIN_LASTNAMES) {
    if (condensed.includes(lastname)) {
      return {
        isBlocked: true,
        category: 'impersonation',
        reason: `Tentative d'usurpation d'identité de l'administrateur ("${lastname}")`,
        matched: lastname,
        originalText: original
      };
    }

    // Fuzzy check sur le nom de famille (distance <= 1 pour les mots de 6+ lettres)
    if (lastname.length >= 6) {
      for (let i = 0; i <= condensed.length - lastname.length + 1; i++) {
        const sub = condensed.substring(i, i + lastname.length);
        if (sub.length === lastname.length && levenshteinDistance(sub, lastname) <= 1) {
          return {
            isBlocked: true,
            category: 'impersonation',
            reason: `Tentative d'usurpation d'identité avec subterfuge ("${sub}" proche de "${lastname}")`,
            matched: sub,
            originalText: original
          };
        }
      }
    }
  }

  // 2. Détection de combinaison Prénom Admin + Nom
  for (const firstname of ADMIN_FIRSTNAMES) {
    if (condensed.includes(firstname)) {
      for (const lastname of ADMIN_LASTNAMES) {
        if (condensed.includes(firstname + lastname) || condensed.includes(lastname + firstname)) {
          return {
            isBlocked: true,
            category: 'impersonation',
            reason: `Tentative d'usurpation d'identité complète ("${firstname} ${lastname}")`,
            matched: `${firstname} ${lastname}`,
            originalText: original
          };
        }
      }
    }
  }

  // B. VÉRIFICATION DES INSULTES & PROPOS COMPROMETTANTS
  // 1. Dans la version condensée (ex: "gakolapute", "salope12", "saleesclave")
  for (const insult of INSULT_KEYWORDS) {
    if (insult.length >= 4 && condensed.includes(insult)) {
      return {
        isBlocked: true,
        category: 'insult',
        reason: `Détection d'un propos injurieux ("${insult}")`,
        matched: insult,
        originalText: original
      };
    }
  }

  // 2. Dans la version mot par mot avec détection fuzzy (tolérance aux fautes d'orthographe)
  const words = spaced.split(' ');
  for (const word of words) {
    if (!word || word.length < 3) continue;

    for (const insult of INSULT_KEYWORDS) {
      if (word === insult) {
        return {
          isBlocked: true,
          category: 'insult',
          reason: `Détection d'un terme injurieux ("${word}")`,
          matched: word,
          originalText: original
        };
      }

      // Tolérance d'une faute pour les mots de 5+ lettres (ex: saloppe, connar)
      if (insult.length >= 5 && Math.abs(word.length - insult.length) <= 1) {
        if (levenshteinDistance(word, insult) <= 1) {
          return {
            isBlocked: true,
            category: 'insult',
            reason: `Détection d'une insulte déguisée ("${word}" proche de "${insult}")`,
            matched: word,
            originalText: original
          };
        }
      }
    }
  }

  return { isBlocked: false };
}

module.exports = {
  LEET_MAP,
  ADMIN_FIRSTNAMES,
  ADMIN_LASTNAMES,
  INSULT_KEYWORDS,
  normalizeForTrollCheck,
  levenshteinDistance,
  checkTrollContent
};
