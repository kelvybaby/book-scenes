export type PassageLeaf = {
  id: 'glory' | 'spell'
  folio: 'I' | 'II'
  treatment: 'aphorism' | 'prose'
  text: string
}

export const underTheAlmondTreesPassages: readonly PassageLeaf[] = [
  {
    id: 'glory',
    folio: 'I',
    treatment: 'aphorism',
    text: '"There is no greater glory than to die for love."',
  },
  {
    id: 'spell',
    folio: 'II',
    treatment: 'prose',
    text: '“To him she seemed so beautiful, so seductive, so different from ordinary people, that he could not understand why no one was as disturbed as he by the clicking of her heels on the paving stones, why no one else\'s heart was wild with the breeze stirred by the sighs of her veils, why everyone did not go mad with the movements of her braid, the flight of her hands, the gold of her laughter. He had not missed a single one of her gestures, not one of the indications of her character, but he did not dare approach her for fear of destroying the spell.”',
  },
]
