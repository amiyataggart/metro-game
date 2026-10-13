import { describe, expect, it } from 'vitest'
import { addFound, filterKnownIds, selectNewIds } from './selectNewIds'

describe('selectNewIds', () => {
  it('returns only ids not yet found', () =>
    expect(selectNewIds([1, 2, 3], [2])).toEqual({
      fresh: [1, 3],
      allFound: false,
    }))
  it('flags a fully found group', () =>
    expect(selectNewIds([1, 2], [1, 2, 9])).toEqual({
      fresh: [],
      allFound: true,
    }))
  it('tolerates a null/empty found list', () =>
    expect(selectNewIds([4], [])).toEqual({ fresh: [4], allFound: false }))
})

describe('filterKnownIds', () => {
  it('drops stored ids that no longer exist in the data', () =>
    expect(filterKnownIds([5, 9, 2, 7], new Set([2, 5, 7]))).toEqual([5, 2, 7]))
  it('keeps order and duplicates of known ids', () =>
    expect(filterKnownIds([3, 3, 1], new Set([1, 3]))).toEqual([3, 3, 1]))
  it('tolerates an empty list', () =>
    expect(filterKnownIds([], new Set([1]))).toEqual([]))
})

describe('addFound', () => {
  it('adds new ids in front and keeps every stored find (e.g. disabled lines)', () =>
    expect(addFound([1, 2], [9, 2, 7])).toEqual([1, 2, 9, 7]))
  it('tolerates an empty stored list', () => expect(addFound([3], [])).toEqual([3]))
})
