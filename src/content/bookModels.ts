export type BookModelAsset = Readonly<{
  id: string
  modelUrl: string
  fallbackUrl: string
  objectName: string
  ariaLabel: string
  fallbackAlt: string
  physicalLeafCount: number
}>

export const loveInTheTimeOfCholeraBookModel: BookModelAsset = {
  id: 'love-in-the-time-of-cholera-reader-copy',
  modelUrl:
    '/assets/books/love-in-the-time-of-cholera/love-in-the-time-of-cholera-book-v1.glb?v=9',
  fallbackUrl:
    '/assets/books/love-in-the-time-of-cholera/love-in-the-time-of-cholera-book-fallback-v1.jpg?v=9',
  objectName: 'ReaderCopy_LoveInTheTimeOfCholera',
  ariaLabel: "Three-dimensional model of the reader's copy of Love in the Time of Cholera",
  fallbackAlt: "The reader's worn copy of Love in the Time of Cholera resting slightly open",
  physicalLeafCount: 5,
}
