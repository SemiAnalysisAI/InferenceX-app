// Vendored from https://github.com/chenglou/handwired (MIT, Copyright (c) Cheng Lou)
// src/runtime/numeric-ui-core.ts at commit 257856e3b221140acb4cc4460626b850c0bd4ff1 (2026-10-16).
// Unmodified apart from this header. Do not edit by hand; re-vendor instead.

// Three runtime atoms and one index read instruction, plus compile-time
// expansions that lower into those.

declare const wireBrand: unique symbol

// A wire is a position in the array an evaluation fills: source cells first,
// then one position per operation. It's a number with a type of its own, so a
// plain number doesn't type-check as a wire, e.g. emitMinimum(circuit, width, 1)
// is refused instead of reading wire 1, which might be the viewport height cell.
// Wires come from circuit.source(index), circuit.constant(value) and the
// operations that return them, and asWire(position) turns a position counted by
// hand into a wire.
export type Wire = number & WireBrand

// Lab folders written before wires had their own type set looseWires with
// lab/types/loose-wires.d.ts in their tsconfig, so plain numbers still
// type-check as wires there.
export interface WireTypeOptions {}
type WireBrand = WireTypeOptions extends {looseWires: true} ? unknown : {readonly [wireBrand]: true}

// A position counted by hand as a wire, e.g. the position of a source cell before
// the circuit exists. Checks that the position is a nonnegative integer.
export function asWire(position: number): Wire {
  invariant(Number.isInteger(position) && position >= 0, `a wire must be a nonnegative integer, got ${position}`)
  return position as Wire
}

export type Terms = readonly (readonly [wire: Wire, coefficient: number])[]

// 'index' is the index read instruction, built only by indexReadAffine.
type AtomKind = 'affine' | 'reglu' | 'boolean' | 'index'

type Macro =
  | {kind: 'multiply', left: Wire, right: Wire}
  | {kind: 'select', gate: Wire, off: Wire, on: Wire}

// What an index read returns when floor(index) is outside 0..count-1: 'clamp'
// reads the nearest end of the table, 'zero' reads +0.
export type OutOfRange = 'clamp' | 'zero'

// Checked at runtime too, since JavaScript callers can pass any string, and any
// rule other than 'zero' would otherwise read as 'clamp'.
const outOfRangeRules: ReadonlySet<string> = new Set<OutOfRange>(['clamp', 'zero'])

// One distinct candidates array, registered once per circuit. Later reads of
// the same array find it by identity, so a large table read by thousands of
// operations is checked and keyed once instead of once per read (ported from
// lab/ui-exploration/code-points, which reads a 24,192-entry table of line
// break classes once per text cell).
type CandidateTable = {
  id: number
  candidates: readonly Wire[]
  maximumDepth: number
  // The union of candidate ranges, per reachable span of positions and
  // out-of-range rules.
  rangeByReach: Map<string, NumericRange>
}

type IndexRead = {
  table: CandidateTable
  below: OutOfRange
  above: OutOfRange
  // The index range the builder accepted: the range inferred from the index
  // form's operands, narrowed by a declared range, e.g. the range declared on the
  // index wire of indexRead. The read's own range and validateIndexReads use it.
  indexRange: NumericRange
}

// Why an operation is a rounding point, i.e. an operation whose evaluation, term
// order or operand wires carry meaning, and what a backend that reorders, fuses or
// copies sums elsewhere, or evaluates sums in float64, has to keep there:
// - 'boolean': a boolean atom, recorded automatically. Its (score + K) - K only
//   rounds to a bit when evaluated in FP32 as written, so a backend keeps the
//   stored FP32 evaluation, e.g. a shader compiler must not simplify it to score.
// - 'integer bit': an operation of emitCompare's integer bits on grids, e.g. the
//   ramp relu(-D) or the bit relu(1 - relu(-D)) on D = (a - b) / grid. Every
//   product and partial sum of its sums is a whole number of grid steps within
//   2^24, so a backend may add its terms in any order, fuse them or evaluate them
//   in float64 and get the same bits, as long as each operation stays its own
//   operation.
// - 'sign cascade': an operation of emitCompare's sign cascade, i.e. the kept
//   difference f(a - b), which only has to keep the sign of a - b, or a stage
//   min(limit, scale × input), which computes exact values in real arithmetic. A
//   backend may evaluate an operation's own sum in any order or in float64, but
//   must keep each operation separate and reading the same wires, e.g. copying a
//   stage into the next stage regroups terms at large magnitudes, and the partial
//   sums round. The smallest differences also need subnormal values: a backend
//   that turns them into 0 reads differences below 2^-126 as equality.
// - 'marked': recorded by the caller with markRoundingPoint, e.g. a step of a
//   round or floor chain. A backend keeps the stored FP32 evaluation, term order
//   and operand wires, like at a boolean atom.
export type RoundingPointKind = 'boolean' | 'integer bit' | 'sign cascade' | 'marked'

type Operation = {
  kind: AtomKind
  leftTerms: Terms
  leftBias: number
  // For an index read, gateTerms and gateBias hold the index form, and the
  // left side is empty.
  gateTerms: Terms
  gateBias: number
  depth: number
  preserveRounding?: true
  macro?: Macro
  indexRead?: IndexRead
  roundingPoint?: RoundingPointKind
  // Set on the bit emitCompare returns, so isProvenBit knows the wire holds
  // exactly 0 or 1. The operations inside the comparison don't get it.
  comparisonBit?: true
}

type NumericRange = {
  minimum: number
  maximum: number
}

type UnsignedIndexArray = Uint8Array | Uint16Array | Uint32Array

// A declared invariant over a set of wires: every member is exactly 0 or 1 and
// their sum is exactly 1. With allowAllZero the all-zero state is also legal
// (emitFirstActive produces that state when its gate is inactive). Like
// assumeRange, the declaration is a contract the builder or trainer promises;
// the compiler uses it to lower one-hot-masked sums to gather reads, and
// validateOneHotGroups can check evaluated values against it in tests.
type OneHotGroup = {
  members: readonly Wire[]
  allowAllZero: boolean
}

// One resolved group index inside a tensor layer: the executor reads the packed
// one-hot bits, takes their dot with 0..N-1 (exact for 0/1 bits summing to at
// most one), and stores the resulting index and mass for the layer's gather
// reads. Computed once per group per evaluation, shared by every read.
type TensorGatherCompute = {
  slot: number
  bitPositions: UnsignedIndexArray
}

// One lowered masked sum: instead of dense rows over N products, the executor
// looks up the packed position of the selected candidate and adds that single
// value onto the row's bias. Groups that allow the all-zero state multiply the
// gathered value by the group mass first, so an inactive group contributes 0.
type TensorGatherRead = {
  row: number
  slot: number
  masked: boolean
  candidatePositions: UnsignedIndexArray
}

// One index read instruction inside a tensor layer. Its index form is an extra
// projection row after the gate rows; the executor floors that row's value and
// copies the selected candidate's packed value into the output row. When
// candidatePositions is empty, candidate k sits at
// candidateBase + k * candidateStride, e.g. a run of source cells, so the table
// stores no positions.
type TensorIndexRead = {
  row: number
  indexRow: number
  belowZero: boolean
  aboveZero: boolean
  candidateCount: number
  candidateBase: number
  candidateStride: number
  candidatePositions: UnsignedIndexArray
}

type TensorLayer = {
  inputIndices: UnsignedIndexArray
  inputSize: number
  outputSize: number
  bias: Float32Array
  gateRows: UnsignedIndexArray
  booleanRows: UnsignedIndexArray
  rowOffsets: UnsignedIndexArray
  columns: UnsignedIndexArray
  weights: Float32Array
  gatherComputes: TensorGatherCompute[]
  gatherReads: TensorGatherRead[]
  indexReads: TensorIndexRead[]
}

type TensorProgram = {
  layers: TensorLayer[]
  roots: UnsignedIndexArray
  sourceSize: number
  valueCount: number
  wireOrder: UnsignedIndexArray
  width: number
  gatherSlotCount: number
}

type TensorWorkspace = {
  packedValues: Float32Array
  input: Float32Array
  projection: Float32Array
  gatherIndices: Int32Array
  gatherMasses: Float32Array
}

// A recognized one-hot-masked sum, keyed by its operation index: the affine's
// terms are products of the group's bits against these candidate value wires,
// ordered by group position.
type GatherPlan = {
  groupIndex: number
  candidateWires: readonly Wire[]
}

type PackedCandidateTable = {
  candidateCount: number
  candidateBase: number
  candidateStride: number
  candidatePositions: UnsignedIndexArray
}

export type CompileOptions = {
  // Place each live operation one layer after the deepest value it reads in the
  // compiled program, instead of at its build-time depth. A lowered gather read
  // then stops waiting for the products it replaced, and everything downstream
  // can move up. Off by default, since it changes the layers of existing
  // programs, e.g. HandwiredOS.
  recomputeDepths?: boolean
}

export type DeclarationOptions = {
  // Declare a range or grid even though operations already read the wire. Those
  // operations keep the range or grid they were built with, see assumeRange.
  allowExistingReaders?: boolean
}

// Every integer within ±2^24 is an FP32 value, so an index form whose range lies
// strictly inside these bounds can hold each position exactly. Ranges follow FP32
// rounding, so an endpoint on ±2^24 can stand for a larger real value, e.g. a cell
// declared within 0..2^24 plus 1 has the endpoint f(2^24 + 1) = 2^24, and at that
// cell value the read would land one position early. Such ranges are refused.
const indexMagnitudeLimit = 2 ** 24

export class Circuit {
  sourceSize: number
  operations: Operation[]
  depths: number[]
  constants: (number | undefined)[]
  expressionWires: Map<string, Wire>
  ranges: NumericRange[]
  // The power of two every value of a wire is a multiple of, e.g. 1/64 for a
  // pointer coordinate the host writes in 1/64 px, or undefined when unknown.
  // Declared with assumeGrid, or inferred for sums and products whose operands
  // have grids and whose declared ranges prove that nothing rounds.
  grids: (number | undefined)[]
  // True for a wire that is declared to hold exactly 0 or 1 with assumeBit, e.g.
  // a cell declared with inputBit. A range of 0..1 alone also allows 0.5. No
  // operation is built differently for a declared bit, and the compiler doesn't
  // read the declaration. A backend reads it, e.g. src/json-search/bit-emit.ts,
  // which holds such a value as one bit of a word.
  exactBits: boolean[]
  // True for a wire once an operation reads it, so assumeRange can refuse a
  // declaration that would come too late for those operations.
  hasReaders: boolean[]
  oneHotGroups: OneHotGroup[]
  tensorProgram: TensorProgram | null
  candidateTablesByArray: WeakMap<readonly Wire[], CandidateTable>
  candidateTablesByContent: Map<string, CandidateTable>

  constructor(sourceSize: number) {
    this.sourceSize = sourceSize
    this.operations = []
    this.depths = Array<number>(sourceSize).fill(0)
    this.constants = Array<number | undefined>(sourceSize).fill(undefined)
    this.expressionWires = new Map()
    this.ranges = Array.from({length: sourceSize}, unknownRange)
    this.grids = Array<number | undefined>(sourceSize).fill(undefined)
    this.exactBits = Array<boolean>(sourceSize).fill(false)
    this.hasReaders = Array<boolean>(sourceSize).fill(false)
    this.oneHotGroups = []
    this.tensorProgram = null
    this.candidateTablesByArray = new WeakMap()
    this.candidateTablesByContent = new Map()
  }

  // Operations built before a declaration keep the range they were built with,
  // e.g. multiply(velocity, timestep) builds 3 operations for a timestep whose
  // range admits negative values, and declaring the timestep nonnegative later
  // doesn't turn them into 1. So a declaration that narrows the range of a wire
  // that operations already read throws, unless the caller passes
  // {allowExistingReaders: true}. The declaration then only affects operations
  // built afterwards, the compiler's gather lowering and the source range check.
  assumeRange(wire: Wire, minimum: number, maximum: number, options: DeclarationOptions = {}) {
    assertWire(wire, this.sourceSize + this.operations.length)
    invariant(minimum <= maximum, 'numeric range is inverted')
    const current = this.ranges[wire]!
    const narrowed = {
      minimum: Math.max(current.minimum, minimum),
      maximum: Math.min(current.maximum, maximum),
    }
    invariant(narrowed.minimum <= narrowed.maximum, 'numeric range contradicts known bounds')
    const narrows = narrowed.minimum > current.minimum || narrowed.maximum < current.maximum
    if (narrows && this.hasReaders[wire] === true && options.allowExistingReaders !== true) {
      invariant(
        false,
        `operations that already read wire ${wire} were built with its range ${current.minimum}..${current.maximum}, `
          + `and declaring ${minimum}..${maximum} now doesn't change them. Declare the range before the first operation `
          + 'that reads the wire, or pass {allowExistingReaders: true}',
      )
    }
    this.ranges[wire] = narrowed
  }

  // Declare that these wires form an exact one-hot: each is exactly 0 or 1 and
  // exactly one of them is 1 (with allowAllZero, all zeros is also legal). The
  // declaration also narrows every member's range to 0..1. emitArgmax declares
  // its selection automatically (the tournament routes the unit down exactly
  // one path regardless of the scores); emitFirstActive declares its selection
  // only when its gate and candidates are provably exact bits, because
  // fractional scores are legal inputs there and break the property.
  // Hand-declared groups (e.g. a focus one-hot stored in the source table) are
  // the caller's promise, checkable with validateOneHotGroups.
  // Like a range, a group doesn't change builder code that already ran, e.g.
  // emitFirstActive declares a group on its selection only when its candidates
  // are proven exact bits, e.g. members of a declared group, so a call that ran
  // before the group was declared left its selection without a group. Narrowing
  // a member's range throws as in assumeRange, but a group whose members already
  // have 0..1 ranges doesn't throw, so declare a group before the builder code
  // that reads its members. Gather lowering, which runs while compiling, reads
  // every group, including one declared late.
  assumeOneHot(members: readonly Wire[], allowAllZero = false, options: DeclarationOptions = {}) {
    invariant(members.length > 0, 'a one-hot group needs at least one member')
    const seen = new Set<Wire>()
    for (const member of members) {
      assertWire(member, this.sourceSize + this.operations.length)
      invariant(!seen.has(member), 'one-hot group members must be distinct wires')
      seen.add(member)
      this.assumeRange(member, 0, 1, options)
    }
    this.oneHotGroups.push({members: [...members], allowAllZero})
    this.tensorProgram = null
  }

  // Declare that every value of this wire is a multiple of step, a power of
  // two, e.g. assumeGrid(pointerX, 1 / 64) when the host writes pointer
  // coordinates in 1/64 px. Like assumeRange, the declaration is a caller
  // promise, checkable in tests with validateGrids. emitCompare uses it to
  // build integer bits instead of a sign cascade. A coarser declared or
  // inferred grid is kept, since its multiples are also multiples of the finer
  // step. Like assumeRange, a declaration that changes the grid of a wire that
  // operations already read throws unless the caller passes
  // {allowExistingReaders: true}, e.g. a sign cascade that emitCompare built
  // before the grid existed stays a sign cascade.
  assumeGrid(wire: Wire, step: number, options: DeclarationOptions = {}) {
    assertWire(wire, this.sourceSize + this.operations.length)
    invariant(isPowerOfTwoGrid(step), `a grid step must be a power of two from 2^-149 to 2^127, got ${step}`)
    const current = this.grids[wire]
    const grid = Math.max(current ?? step, step)
    if (grid !== current && this.hasReaders[wire] === true && options.allowExistingReaders !== true) {
      invariant(
        false,
        `operations that already read wire ${wire} were built ${current === undefined ? 'without a grid' : `with its grid ${current}`}, `
          + `and declaring the grid ${step} now doesn't change them. Declare the grid before the first operation `
          + 'that reads the wire, or pass {allowExistingReaders: true}',
      )
    }
    this.grids[wire] = grid
  }

  // Declare that this wire holds exactly 0 or 1, e.g. a cell that JavaScript
  // writes as a bit. Like assumeRange, the declaration is a caller promise, and
  // it also narrows the wire's range to 0..1. Unlike assumeGrid(wire, 1), it
  // changes no operation that is built afterwards, e.g. emitCompare still builds
  // a sign cascade for a sum that reads the wire.
  assumeBit(wire: Wire, options: DeclarationOptions = {}) {
    this.assumeRange(wire, 0, 1, options)
    this.exactBits[wire] = true
  }

  // Record an operation as a rounding point, e.g. each step of a round chain
  // like (x + 2^23 + 2^22) - (2^23 + 2^22) built with roundAffine. See
  // RoundingPointKind.
  markRoundingPoint(wire: Wire) {
    recordRoundingPoint(this, wire, 'marked')
  }

  // Every rounding point in wire order: boolean atoms, the operations of
  // emitCompare, and wires marked with markRoundingPoint. A backend that
  // reorders or fuses sums, or a GPU backend that guards against its shader
  // compiler folding (x + K) - K, can keep the stored FP32 evaluation at these
  // operations and relax it everywhere else.
  roundingPoints(): {wire: Wire, kind: RoundingPointKind}[] {
    const points: {wire: Wire, kind: RoundingPointKind}[] = []
    for (let operationIndex = 0; operationIndex < this.operations.length; operationIndex++) {
      const kind = this.operations[operationIndex]!.roundingPoint
      if (kind !== undefined) points.push({wire: (this.sourceSize + operationIndex) as Wire, kind})
    }
    return points
  }

  isNonNegative(wire: Wire) {
    return this.ranges[wire]!.minimum >= 0
  }

  // The wire of source cell `index`, e.g. circuit.source(0) for the first cell.
  source(index: number): Wire {
    invariant(Number.isInteger(index) && index >= 0 && index < this.sourceSize, `source cell ${index} is outside the source table`)
    return index as Wire
  }

  // A wire that always holds f(value), e.g. circuit.constant(1). An ordinary
  // affine that reads it adds the value to its bias instead.
  constant(value: number): Wire {
    return this.affine([], value)
  }

  affine(terms: Terms, bias = 0): Wire {
    return this.append('affine', terms, bias, [], 0)
  }

  // Keep this evaluation, term order, and input wires intact, including constants.
  // The operation stores the terms array it's given, without copying it. A caller
  // that wants a longer sum later builds a new array instead of changing the one
  // it passed, e.g. circuit.roundAffine([...terms, [limit, 1]]).
  roundAffine(terms: Terms, bias = 0): Wire {
    return this.append('affine', terms, bias, [], 0, {preserveRounding: true})
  }

  multiply(left: Wire, right: Wire): Wire {
    const options = {preserveRounding: true, macro: {kind: 'multiply', left, right}} as const
    if (this.isNonNegative(right)) {
      return this.append('reglu', [[left, 1]], 0, [[right, 1]], 0, options)
    }
    if (this.isNonNegative(left)) {
      return this.append('reglu', [[right, 1]], 0, [[left, 1]], 0, options)
    }
    const positive = this.append('reglu', [[left, 1]], 0, [[right, 1]], 0, {preserveRounding: true})
    const negative = this.append('reglu', [[left, 1]], 0, [[right, -1]], 0, {preserveRounding: true})
    return this.append('affine', [[positive, 1], [negative, -1]], 0, [], 0, options)
  }

  select(gate: Wire, off: Wire, on: Wire): Wire {
    const complement = this.roundAffine([[gate, -1]], 1)
    const selectedOn = this.multiply(gate, on)
    const selectedOff = this.multiply(complement, off)
    return this.append('affine', [[selectedOn, 1], [selectedOff, 1]], 0, [], 0, {
      preserveRounding: true,
      macro: {kind: 'select', gate, off, on},
    })
  }

  reglu(leftTerms: Terms, leftBias: number, gateTerms: Terms, gateBias: number): Wire {
    return this.append('reglu', leftTerms, leftBias, gateTerms, gateBias)
  }

  boolean(value: Wire): Wire {
    const range = this.ranges[value]!
    invariant(range.minimum >= 0 && range.maximum <= 1, 'boolean input must be within zero and one')
    return this.append('boolean', [[value, 1]], 0, [], 0)
  }

  // Read candidates[floor(index)] as one instruction, e.g. a row's height at a
  // computed row. The index needs a declared range strictly inside ±2^24 and must
  // hold an integer, which validateIndexReads checks in tests. The range declared on the
  // index wire counts even when the builder copies a small affine index into the
  // read, e.g. row = affine([[firstRow, 1], [offset, 1]]) declared within 0..999
  // while firstRow and offset have no declared ranges: the copied form adds the
  // same terms in the same order from the same bias, so it holds the exact value
  // of row. Outside the table the read clamps to the nearest end, or reads +0
  // with {outOfRange: 'zero'}. The selected value is copied without rounding.
  // Candidates may repeat, may be infinite, and need no declared range. The
  // builder freezes the candidates array, so changing it after a read throws
  // instead of silently changing what the earlier read meant.
  indexRead(index: Wire, candidates: readonly Wire[], options: {outOfRange?: OutOfRange} = {}): Wire {
    assertWire(index, this.sourceSize + this.operations.length)
    const outOfRange = options.outOfRange ?? 'clamp'
    return this.indexReadAffine([[index, 1]], 0, candidates, outOfRange, outOfRange, {indexRange: this.ranges[index]!})
  }

  // The same instruction with the index written as an affine form and one rule
  // per side, e.g. [[firstRow, 1]] with bias 3 and 'clamp', 'zero' reads the
  // fourth visible row, and +0 past the end of the table. Small affine producers
  // compose into the form, as they compose into a ReGLU gate. The index range is
  // inferred from the declared ranges of the operands after composing, then
  // narrowed by options.indexRange, a caller promise about the form's value like
  // assumeRange, which validateIndexReads checks in tests.
  indexReadAffine(
    indexTerms: Terms,
    indexBias: number,
    candidates: readonly Wire[],
    below: OutOfRange,
    above: OutOfRange,
    options: {indexRange?: NumericRange} = {},
  ): Wire {
    const width = (this.sourceSize + this.operations.length) as Wire
    invariant(outOfRangeRules.has(below) && outOfRangeRules.has(above), 'index read sides must be clamp or zero')
    for (const [wire, coefficient] of indexTerms) {
      assertWire(wire, width)
      invariant(Number.isFinite(coefficient), 'index coefficient must be finite')
    }
    invariant(Number.isFinite(indexBias), 'index bias must be finite')
    const table = registerCandidateTable(this, candidates)
    let [terms, bias] = foldConstantTerms(normalizeTerms(indexTerms), indexBias, this.constants)
    // The wires that the read's index form reads, counted like append's: after dropping zero coefficients and folding
    // constant wires into the bias, but before copying small affine producers in.
    const readTerms = terms
    ;[terms, bias] = composeAffineTerms(terms, bias, this.sourceSize, this.operations)
    if (terms.length === 0) {
      // A constant index selects its candidate while building.
      const constantIndex = Math.fround(bias)
      invariant(!Number.isNaN(constantIndex), 'a constant index must not be NaN')
      const position = resolveIndexPosition(
        constantIndex,
        table.candidates.length,
        below === 'zero',
        above === 'zero',
      )
      return position >= 0 ? table.candidates[position]! : this.affine([], 0)
    }
    let indexRange = evaluateAffineRange(terms, bias, this.ranges)
    if (options.indexRange !== undefined) {
      indexRange = {
        minimum: Math.max(indexRange.minimum, options.indexRange.minimum),
        maximum: Math.min(indexRange.maximum, options.indexRange.maximum),
      }
      // A NaN endpoint passes here and fails the magnitude check below.
      invariant(
        !(indexRange.minimum > indexRange.maximum),
        'the declared index range contradicts the range inferred from the index form',
      )
    }
    if (!(indexRange.minimum > -indexMagnitudeLimit && indexRange.maximum < indexMagnitudeLimit)) {
      invariant(
        false,
        `index read needs an index range declared strictly inside ±2^24, got ${indexRange.minimum}..${indexRange.maximum}`,
      )
    }
    const expressionKey = `${serializeExpression('index', [], 0, terms, bias)}|${below},${above}|table${table.id}`
    const existingWire = this.expressionWires.get(expressionKey)
    if (existingWire !== undefined) return existingWire
    let depth = table.maximumDepth
    for (const [dependency] of terms) depth = Math.max(depth, this.depths[dependency]!)
    this.operations.push({
      kind: 'index',
      leftTerms: [],
      leftBias: 0,
      gateTerms: terms,
      gateBias: bias,
      depth: depth + 1,
      indexRead: {table, below, above, indexRange},
    })
    this.depths.push(depth + 1)
    this.constants.push(undefined)
    this.grids.push(undefined)
    this.exactBits.push(false)
    this.hasReaders.push(false)
    for (const [wire] of readTerms) this.hasReaders[wire] = true
    this.ranges.push(indexReadRange(table, indexRange, below, above, this.ranges))
    this.expressionWires.set(expressionKey, width)
    this.tensorProgram = null
    return width
  }

  append(
    kind: Exclude<AtomKind, 'index'>,
    leftTerms: Terms,
    leftBias: number,
    gateTerms: Terms,
    gateBias: number,
    options: {preserveRounding?: true, macro?: Macro} = {},
  ): Wire {
    // The wires that the operation reads, so assumeRange and assumeGrid can refuse
    // a declaration that comes after it. Without preserveRounding, these are the
    // terms after dropping zero coefficients and folding constant wires into the
    // bias, but before copying small affine producers in, so a producer counts as
    // read even when the operation reads the producer's own terms instead. A side
    // that ends up with no terms reads nothing, e.g. reglu([[x, 1]], 0, [], -1)
    // folds to the constant 0 and doesn't read x. With preserveRounding, the
    // operation stores the given arrays without copying them (see roundAffine).
    let readLeftTerms = leftTerms
    let readGateTerms = gateTerms
    if (!options.preserveRounding) {
      ;[leftTerms, leftBias] = foldConstantTerms(normalizeTerms(leftTerms), leftBias, this.constants)
      ;[gateTerms, gateBias] = foldConstantTerms(normalizeTerms(gateTerms), gateBias, this.constants)
      readLeftTerms = leftTerms
      readGateTerms = gateTerms
      const initialAlias = kind === 'affine' ? identityWire(leftTerms, leftBias) : undefined
      if (initialAlias !== undefined) return initialAlias
      ;[leftTerms, leftBias] = composeAffineTerms(
        leftTerms,
        leftBias,
        this.sourceSize,
        this.operations,
      )
      ;[gateTerms, gateBias] = composeAffineTerms(
        gateTerms,
        gateBias,
        this.sourceSize,
        this.operations,
      )
      if (kind === 'reglu' && gateTerms.length === 0) {
        const gate = Math.max(0, gateBias)
        kind = 'affine'
        leftTerms = gate === 0
          ? []
          : leftTerms.map(([wire, coefficient]) => [wire, coefficient * gate])
        leftBias *= gate
        gateBias = 0
      } else if (kind === 'reglu' && leftTerms.length === 0 && leftBias === 0) {
        kind = 'affine'
        gateTerms = []
        gateBias = 0
      }
      const composedAlias = kind === 'affine' ? identityWire(leftTerms, leftBias) : undefined
      if (composedAlias !== undefined) return composedAlias
    }
    const expressionKey = serializeExpression(kind, leftTerms, leftBias, gateTerms, gateBias)
      + (options.preserveRounding ? '|round' : '')
      + (options.macro === undefined ? '' : `|${serializeMacro(options.macro)}`)
    const existingWire = this.expressionWires.get(expressionKey)
    if (existingWire !== undefined) return existingWire
    const wire = (this.sourceSize + this.operations.length) as Wire
    const dependencies = kind === 'reglu' ? [...leftTerms, ...gateTerms] : leftTerms
    let depth = 0
    for (const [dependency] of dependencies) depth = Math.max(depth, this.depths[dependency]!)
    this.operations.push({
      kind,
      leftTerms,
      leftBias,
      gateTerms,
      gateBias,
      depth: depth + 1,
      ...options,
      ...(kind === 'boolean' ? {roundingPoint: 'boolean'} as const : {}),
    })
    this.depths.push(depth + 1)
    this.constants.push(!options.preserveRounding && kind === 'affine' && leftTerms.length === 0 ? leftBias : undefined)
    this.grids.push(inferOperationGrid(kind, leftTerms, leftBias, gateTerms, gateBias, this.grids, this.ranges))
    this.exactBits.push(false)
    this.hasReaders.push(false)
    if (leftTerms.length > 0) for (const [dependency] of readLeftTerms) this.hasReaders[dependency] = true
    if (gateTerms.length > 0) for (const [dependency] of readGateTerms) this.hasReaders[dependency] = true
    const leftRange = evaluateAffineRange(leftTerms, leftBias, this.ranges)
    this.ranges.push(
      kind === 'affine'
        ? leftRange
        : kind === 'reglu'
          ? multiplyByReluRange(leftRange, evaluateAffineRange(gateTerms, gateBias, this.ranges))
          : {minimum: 0, maximum: 1},
    )
    this.expressionWires.set(expressionKey, wire)
    this.tensorProgram = null
    return wire
  }

  evaluateReference(source: Float32Array): Float32Array {
    this.validateSourceRanges(source)
    return evaluateOperationStream(source, this)
  }

  backpropagateReference(
    values: Float32Array,
    outputGradients: Float32Array,
    options: {
      booleanGradient?: 'reject' | 'straight-through'
      indexGradient?: 'reject' | 'zero' | 'backward-difference'
    } = {},
  ): Float32Array {
    const width = this.sourceSize + this.operations.length
    invariant(values.length === width, 'forward values have the wrong length')
    invariant(outputGradients.length === width, 'output gradients have the wrong length')
    const gradients = new Float32Array(outputGradients)
    // Differentiate FP32 arithmetic as real-valued; ReLU uses zero slope at its corner.
    for (let operationIndex = this.operations.length - 1; operationIndex >= 0; operationIndex--) {
      const operation = this.operations[operationIndex]!
      const outputWire = this.sourceSize + operationIndex
      const outputGradient = gradients[outputWire]!
      if (outputGradient === 0) continue
      const macro = operation.macro
      if (macro?.kind === 'multiply') {
        accumulateTermGradients(gradients, [[macro.left, values[macro.right]!]], outputGradient)
        accumulateTermGradients(gradients, [[macro.right, values[macro.left]!]], outputGradient)
        continue
      }
      if (macro?.kind === 'select') {
        const gate = values[macro.gate]!
        accumulateTermGradients(gradients, [[macro.off, 1 - gate], [macro.on, gate]], outputGradient)
        accumulateTermGradients(gradients, [[macro.gate, values[macro.on]! - values[macro.off]!]], outputGradient)
        continue
      }
      if (operation.kind === 'index') {
        // The selected candidate receives the output gradient, like the backward
        // pass of a gather. The read is a step function of the index: its
        // derivative is 0 between integers and undefined at them, so the caller
        // chooses what the index form receives.
        const read = operation.indexRead!
        const indexGradient = options.indexGradient ?? 'reject'
        if (indexGradient === 'reject') {
          throw new Error('cannot backpropagate into the index of an index read; pass indexGradient')
        }
        const indexValue = evaluateTerms(values, operation.gateTerms, operation.gateBias)
        const position = resolveIndexPosition(
          indexValue,
          read.table.candidates.length,
          read.below === 'zero',
          read.above === 'zero',
        )
        if (position >= 0) {
          accumulateTermGradients(gradients, [[read.table.candidates[position]!, 1]], outputGradient)
        }
        if (indexGradient === 'backward-difference' && Number.isFinite(indexValue)) {
          // What this backward pass gives a ReLU one-hot masked sum at an integer
          // index i, with bits built from relu(i - j + 1) - relu(i - j): the ReLU
          // at its corner gets slope 0, so the index receives read(i) - read(i - 1),
          // with the same rule outside the table. Ported from index-read, kept at
          // https://github.com/chenglou/handwired/tree/exploration-2026-09/lab/ui-exploration/index-read,
          // which compared the two on every source wire.
          const floorIndex = Math.floor(indexValue)
          const difference = readIndexedValue(values, read, floorIndex)
            - readIndexedValue(values, read, floorIndex - 1)
          accumulateTermGradients(gradients, operation.gateTerms, Math.fround(outputGradient * difference))
        }
        continue
      }
      if (operation.kind === 'boolean') {
        if (options.booleanGradient !== 'straight-through') {
          throw new Error('cannot backpropagate through a boolean atom')
        }
        accumulateTermGradients(gradients, operation.leftTerms, outputGradient)
        continue
      }
      if (operation.kind === 'affine') {
        accumulateTermGradients(gradients, operation.leftTerms, outputGradient)
        continue
      }
      const left = evaluateTerms(values, operation.leftTerms, operation.leftBias)
      const gate = evaluateTerms(values, operation.gateTerms, operation.gateBias)
      const activeGate = Math.max(0, gate)
      accumulateTermGradients(
        gradients,
        operation.leftTerms,
        Math.fround(outputGradient * activeGate),
      )
      if (gate > 0) {
        accumulateTermGradients(
          gradients,
          operation.gateTerms,
          Math.fround(outputGradient * left),
        )
      }
    }
    return gradients
  }

  // Every wire's value, with 0 for the wires that the program removed. Without `program`, it runs this.tensorProgram,
  // which the caller may have set, e.g. to a program of a machine's roots, and which otherwise becomes a program of
  // every operation on the first call.
  evaluateTensor(source: Float32Array, program?: TensorProgram): Float32Array {
    this.validateSourceRanges(source)
    return evaluateTensorProgram(source, program ?? (this.tensorProgram ??= this.compileTensorProgram()))
  }

  // The returned output array is reused and overwritten on the next call.
  createTensorEvaluator(
    roots: readonly Wire[],
    options: CompileOptions = {},
  ): (source: Float32Array) => Float32Array {
    return this.createTensorProgramEvaluator(this.compileTensorProgram(roots, true, options))
  }

  // createTensorEvaluator for a program that compileTensorProgram already returned, e.g. one that the caller also
  // validates or reads counts from, so that the circuit compiles once. The evaluator returns the program's roots.
  // Its packedValues property is the array that the evaluator computes in: after a call, packedValues[index] is the
  // value of wire program.wireOrder[index], for the source cells and every live operation, e.g. for HandwiredOS's
  // Monitor window, which lists each operation's current value. The next call overwrites the array.
  createTensorProgramEvaluator(program: TensorProgram): ((source: Float32Array) => Float32Array) & {packedValues: Float32Array} {
    const workspace = createTensorWorkspace(program)
    const positions = Array.from(program.roots, root => program.wireOrder.indexOf(root))
    const outputs = new Float32Array(program.roots.length)
    const evaluate = (source: Float32Array) => {
      this.validateSourceRanges(source)
      executeTensorProgram(source, program, workspace)
      for (let index = 0; index < positions.length; index++) {
        outputs[index] = workspace.packedValues[positions[index]!]!
      }
      return outputs
    }
    return Object.assign(evaluate, {packedValues: workspace.packedValues})
  }

  validateSourceRanges(source: Float32Array) {
    invariant(source.length === this.sourceSize, 'source table has the wrong length')
    for (let wire = 0; wire < source.length; wire++) {
      const range = this.ranges[wire]!
      // The message is built only on failure; constructing it eagerly would
      // allocate one string per source cell on every evaluation.
      if (!(source[wire]! >= range.minimum && source[wire]! <= range.maximum)) {
        invariant(false, `source wire ${wire} is outside its assumed range`)
      }
    }
  }

  compileTensorProgram(
    roots?: readonly Wire[],
    lowerGathers = true,
    options: CompileOptions = {},
  ): TensorProgram {
    const width = this.sourceSize + this.operations.length
    const normalizedRoots = roots ?? Array.from(
      {length: this.operations.length},
      (_, operationIndex) => (this.sourceSize + operationIndex) as Wire,
    )
    const gatherPlans = lowerGathers ? planGatherLowering(this) : new Map<number, GatherPlan>()
    const liveOperations = findLiveOperations(
      normalizedRoots,
      this.sourceSize,
      this.operations,
      width,
      gatherPlans,
      this.oneHotGroups,
    )
    const compiledDepths = options.recomputeDepths === true
      ? computeCompiledDepths(this, liveOperations, gatherPlans)
      : null
    const operationsByLayer: number[][] = []
    for (let operationIndex = 0; operationIndex < this.operations.length; operationIndex++) {
      if (liveOperations[operationIndex] === 0) continue
      const depth = compiledDepths === null
        ? this.operations[operationIndex]!.depth
        : compiledDepths[operationIndex]!
      const layerIndex = depth - 1
      const operationIndices = operationsByLayer[layerIndex] ??= []
      operationIndices.push(operationIndex)
    }

    const layers: TensorLayer[] = []
    const liveOperationCount = liveOperations.reduce((sum, live) => sum + live, 0)
    const valueCount = this.sourceSize + liveOperationCount
    const wireOrder = new Uint32Array(valueCount)
    const packedIndexByWire = new Int32Array(width)
    packedIndexByWire.fill(-1)
    for (let wire = 0; wire < this.sourceSize; wire++) {
      wireOrder[wire] = wire
      packedIndexByWire[wire] = wire
    }
    let availableValues = this.sourceSize
    // inputColumnByWire[wire] is the wire's column in the layer being compiled, or
    // -1 when the layer doesn't read the wire. Every layer uses this one array and
    // resets its own entries when it's done. A new array per layer would allocate
    // the circuit's whole width each time, e.g. 275 layers × 116,053 wires × 4
    // bytes, about 128 MB, for HandwiredOS.
    const inputColumnByWire = new Int32Array(width)
    inputColumnByWire.fill(-1)
    const slotByGroup = new Map<number, number>()
    const packedTables = new Map<CandidateTable, PackedCandidateTable>()
    for (let layerIndex = 0; layerIndex < operationsByLayer.length; layerIndex++) {
      const operationIndices = operationsByLayer[layerIndex]
      if (operationIndices === undefined) continue
      const outputSize = operationIndices.length
      const inputWires = new Set<Wire>()
      for (const operationIndex of operationIndices) {
        // Gather rows read packed values directly by position; they pull
        // nothing through the layer's input gather.
        if (gatherPlans.has(operationIndex)) continue
        const operation = this.operations[operationIndex]!
        for (const [wire] of operation.leftTerms) inputWires.add(wire)
        for (const [wire] of operation.gateTerms) inputWires.add(wire)
      }
      const orderedInputWires = [...inputWires].sort(
        (left, right) => packedIndexByWire[left]! - packedIndexByWire[right]!,
      )
      const inputSize = orderedInputWires.length
      let gateCount = 0
      let booleanCount = 0
      let indexReadCount = 0
      for (const operationIndex of operationIndices) {
        const kind = this.operations[operationIndex]!.kind
        if (kind === 'reglu') gateCount++
        else if (kind === 'boolean') booleanCount++
        else if (kind === 'index') indexReadCount++
      }
      const inputIndices = compactUnsignedIndices(
        orderedInputWires.map(wire => packedIndexByWire[wire]!),
      )
      for (let column = 0; column < inputSize; column++) {
        inputColumnByWire[orderedInputWires[column]!] = column
      }
      // Projection rows: one per output, then one gate row per ReGLU, then one
      // index row per index read.
      const projectionSize = outputSize + gateCount + indexReadCount
      const bias = new Float32Array(projectionSize)
      const gateRows: number[] = []
      const booleanRows: number[] = []
      const projectionTerms = Array<Terms>(projectionSize)
      const pendingGatherReads: {row: number, plan: GatherPlan}[] = []
      const pendingIndexReads: {row: number, indexRow: number, read: IndexRead}[] = []
      let gateRow = 0
      let indexReadRow = 0
      for (let row = 0; row < operationIndices.length; row++) {
        const operationIndex = operationIndices[row]!
        const operation = this.operations[operationIndex]!
        const outputWire = this.sourceSize + operationIndex
        const packedOutput = availableValues + row
        wireOrder[packedOutput] = outputWire
        packedIndexByWire[outputWire] = packedOutput
        bias[row] = operation.leftBias
        const plan = gatherPlans.get(operationIndex)
        if (plan !== undefined) {
          // The lowered sum keeps its bias in the sparse row and stores no
          // weights; the executor adds the gathered value onto the bias.
          projectionTerms[row] = []
          pendingGatherReads.push({row, plan})
          continue
        }
        projectionTerms[row] = operation.leftTerms
        if (operation.kind === 'reglu') {
          const projectionRow = outputSize + gateRow
          bias[projectionRow] = operation.gateBias
          gateRows.push(row)
          projectionTerms[projectionRow] = operation.gateTerms
          gateRow++
        } else if (operation.kind === 'boolean') {
          booleanRows.push(row)
        } else if (operation.kind === 'index') {
          // The output row keeps zero bias and no weights; the executor copies
          // the selected candidate into it.
          const indexRow = outputSize + gateCount + indexReadRow
          bias[indexRow] = operation.gateBias
          projectionTerms[indexRow] = operation.gateTerms
          pendingIndexReads.push({row, indexRow, read: operation.indexRead!})
          indexReadRow++
        }
      }
      const gatherComputes: TensorGatherCompute[] = []
      const gatherReads: TensorGatherRead[] = []
      for (const {row, plan} of pendingGatherReads) {
        const group = this.oneHotGroups[plan.groupIndex]!
        let slot = slotByGroup.get(plan.groupIndex)
        if (slot === undefined) {
          // First read of this group: resolve its index here, once, before any
          // of the layer's reads run. Bits and candidates sit at strictly
          // earlier depths than the sum they fed, so they are already packed.
          slot = slotByGroup.size
          slotByGroup.set(plan.groupIndex, slot)
          const bitPositions = group.members.map(member => {
            const position = packedIndexByWire[member]!
            invariant(position >= 0 && position < availableValues, 'gather bit is not available')
            return position
          })
          gatherComputes.push({slot, bitPositions: compactUnsignedIndices(bitPositions)})
        }
        const candidatePositions = plan.candidateWires.map(candidate => {
          const position = packedIndexByWire[candidate]!
          invariant(position >= 0 && position < availableValues, 'gather candidate is not available')
          return position
        })
        gatherReads.push({
          row,
          slot,
          masked: group.allowAllZero,
          candidatePositions: compactUnsignedIndices(candidatePositions),
        })
      }
      const indexReads: TensorIndexRead[] = []
      for (const {row, indexRow, read} of pendingIndexReads) {
        let packed = packedTables.get(read.table)
        if (packed === undefined) {
          // Candidates sit at strictly earlier depths than every read of their
          // table, so the first read already finds them packed.
          packed = packCandidateTable(read.table, packedIndexByWire, availableValues)
          packedTables.set(read.table, packed)
        }
        indexReads.push({
          row,
          indexRow,
          belowZero: read.below === 'zero',
          aboveZero: read.above === 'zero',
          ...packed,
        })
      }
      const rowOffsets = Array<number>(projectionSize + 1).fill(0)
      for (let row = 0; row < projectionSize; row++) {
        rowOffsets[row + 1] = rowOffsets[row]! + projectionTerms[row]!.length
      }
      const storedWeightCount = rowOffsets[projectionSize]!
      const columns = Array<number>(storedWeightCount)
      const weights = new Float32Array(storedWeightCount)
      let storedWeight = 0
      for (const terms of projectionTerms) {
        for (const [wire, coefficient] of terms) {
          const column = inputColumnByWire[wire]!
          invariant(column >= 0, 'tensor dependency is not available')
          columns[storedWeight] = column
          weights[storedWeight] = coefficient
          storedWeight++
        }
      }
      for (let column = 0; column < inputSize; column++) {
        inputColumnByWire[orderedInputWires[column]!] = -1
      }
      layers.push({
        inputIndices,
        inputSize,
        outputSize,
        bias,
        gateRows: compactUnsignedIndices(gateRows),
        booleanRows: compactUnsignedIndices(booleanRows),
        rowOffsets: compactUnsignedIndices(rowOffsets),
        columns: compactUnsignedIndices(columns),
        weights,
        gatherComputes,
        gatherReads,
        indexReads,
      })
      availableValues += outputSize
    }
    return {
      layers,
      roots: compactUnsignedIndices(normalizedRoots),
      sourceSize: this.sourceSize,
      valueCount,
      wireOrder: compactUnsignedIndices(wireOrder),
      width,
      gatherSlotCount: slotByGroup.size,
    }
  }

}

function unknownRange(): NumericRange {
  return {minimum: Number.NEGATIVE_INFINITY, maximum: Number.POSITIVE_INFINITY}
}

// FP32 represents every multiple of a power of two with at most 24 significant
// bits, e.g. every multiple of 1/64 within ±2^18. A sum or product of values on
// grids is a multiple of the smallest of those grids, so it evaluates without
// rounding while it stays within this many grid steps.
const exactGridSteps = 2 ** 24
const smallestGrid = 2 ** -149
const largestGrid = 2 ** 127

const float64Scratch = new DataView(new ArrayBuffer(8))

// The largest power of two dividing a finite nonzero value, e.g. 4 for 12 and
// 0.25 for 0.75. Every finite float is an integer times a power of two, so
// every FP32 constant and coefficient has one.
function lowestPowerOfTwo(value: number): number {
  float64Scratch.setFloat64(0, value)
  const high = float64Scratch.getUint32(0)
  const low = float64Scratch.getUint32(4)
  const biasedExponent = (high >>> 20) & 0x7ff
  // FP32 values are normal float64 values, so the implicit leading mantissa bit is set.
  const exponent = biasedExponent - 1075
  const trailingZeros = low !== 0
    ? countTrailingZeros(low)
    : 32 + countTrailingZeros((high & 0xfffff) | 0x100000)
  return 2 ** (exponent + trailingZeros)
}

function countTrailingZeros(bits: number) {
  return 31 - Math.clz32(bits & -bits)
}

function isPowerOfTwoGrid(step: number) {
  return Number.isFinite(step) && step >= smallestGrid && step <= largestGrid && lowestPowerOfTwo(step) === step
}

type GridForm = {grid: number, magnitude: number}

// The grid of an affine form evaluated in FP32, when every term reads a wire
// with a grid and the declared ranges keep every product and partial sum
// within 2^24 grid steps, so nothing rounds. magnitude bounds |bias| plus every
// |coefficient × operand|, which bounds every partial sum in any term order.
function inferFormGrid(
  terms: Terms,
  bias: number,
  grids: readonly (number | undefined)[],
  ranges: readonly NumericRange[],
): GridForm | undefined {
  const roundedBias = Math.fround(bias)
  let grid = roundedBias === 0 ? Number.POSITIVE_INFINITY : lowestPowerOfTwo(roundedBias)
  let magnitude = Math.abs(roundedBias)
  for (const [wire, coefficient] of terms) {
    const wireGrid = grids[wire]
    if (wireGrid === undefined) return undefined
    const range = ranges[wire]!
    const largestOperand = Math.max(Math.abs(range.minimum), Math.abs(range.maximum))
    // An open range can hold Infinity, and f(0 × Infinity) is NaN.
    if (!Number.isFinite(largestOperand)) return undefined
    const roundedCoefficient = Math.fround(coefficient)
    if (roundedCoefficient === 0) continue
    grid = Math.min(grid, wireGrid * lowestPowerOfTwo(roundedCoefficient))
    magnitude += Math.abs(roundedCoefficient) * largestOperand
  }
  if (!(Number.isFinite(grid) && grid >= smallestGrid && magnitude <= exactGridSteps * grid)) return undefined
  // A finite FP32 multiple of a power of two above 2^127 can only be 0, which
  // is also a multiple of 2^127.
  return {grid: Math.min(grid, largestGrid), magnitude}
}

// The grid of an operation's result, inferred at append time: an affine sum
// takes its form's grid, a ReGLU product the product of both forms' grids while
// the product stays within 2^24 grid steps, and a boolean atom returns 0 or 1.
// Index reads get no grid.
function inferOperationGrid(
  kind: Exclude<AtomKind, 'index'>,
  leftTerms: Terms,
  leftBias: number,
  gateTerms: Terms,
  gateBias: number,
  grids: readonly (number | undefined)[],
  ranges: readonly NumericRange[],
): number | undefined {
  if (kind === 'boolean') return 1
  const left = inferFormGrid(leftTerms, leftBias, grids, ranges)
  if (left === undefined) return undefined
  if (kind === 'affine') return left.grid
  const gate = inferFormGrid(gateTerms, gateBias, grids, ranges)
  if (gate === undefined) return undefined
  const grid = left.grid * gate.grid
  if (!(grid >= smallestGrid && left.magnitude * gate.magnitude <= exactGridSteps * grid)) return undefined
  return Math.min(grid, largestGrid)
}

// Earlier records win, e.g. a boolean atom that emitCompare returns stays
// 'boolean'.
function recordRoundingPoint(circuit: Circuit, wire: Wire, kind: RoundingPointKind) {
  assertWire(wire, circuit.sourceSize + circuit.operations.length)
  invariant(wire >= circuit.sourceSize, 'a rounding point must be an operation, not a source cell')
  circuit.operations[wire - circuit.sourceSize]!.roundingPoint ??= kind
}

function evaluateAffineRange(
  terms: Terms,
  bias: number,
  ranges: readonly NumericRange[],
): NumericRange {
  let minimum = Math.fround(bias)
  let maximum = Math.fround(bias)
  for (const [wire, coefficient] of terms) {
    const range = ranges[wire]!
    const roundedCoefficient = Math.fround(coefficient)
    if (roundedCoefficient > 0) {
      minimum = Math.fround(minimum + Math.fround(roundedCoefficient * range.minimum))
      maximum = Math.fround(maximum + Math.fround(roundedCoefficient * range.maximum))
    } else {
      minimum = Math.fround(minimum + Math.fround(roundedCoefficient * range.maximum))
      maximum = Math.fround(maximum + Math.fround(roundedCoefficient * range.minimum))
    }
    if (Number.isNaN(minimum) || Number.isNaN(maximum)) return unknownRange()
  }
  if (Number.isNaN(minimum) || Number.isNaN(maximum)) return unknownRange()
  return {minimum, maximum}
}

function multiplyByReluRange(left: NumericRange, gate: NumericRange): NumericRange {
  const gateMinimum = Math.max(0, gate.minimum)
  const gateMaximum = Math.max(0, gate.maximum)
  const products = [
    Math.fround(left.minimum * gateMinimum),
    Math.fround(left.minimum * gateMaximum),
    Math.fround(left.maximum * gateMinimum),
    Math.fround(left.maximum * gateMaximum),
  ]
  // Zero times an infinite endpoint can produce NaN. Do not turn it into a
  // finite bound that would later authorize removing an unselected product.
  if (products.some(Number.isNaN)) return unknownRange()
  return {minimum: Math.min(...products), maximum: Math.max(...products)}
}

function findLiveOperations(
  roots: readonly Wire[],
  sourceSize: number,
  operations: readonly Operation[],
  width: number,
  gatherPlans: ReadonlyMap<number, GatherPlan>,
  oneHotGroups: readonly OneHotGroup[],
): Uint8Array {
  const liveOperations = new Uint8Array(operations.length)
  const pending = [...roots]
  // A table read by many operations contributes its candidates once.
  const visitedTables = new Set<CandidateTable>()
  while (pending.length > 0) {
    const wire = pending.pop()!
    assertWire(wire, width)
    if (wire < sourceSize) continue
    const operationIndex = wire - sourceSize
    if (liveOperations[operationIndex] === 1) continue
    liveOperations[operationIndex] = 1
    const plan = gatherPlans.get(operationIndex)
    if (plan !== undefined) {
      // A lowered sum no longer reads its product terms; it reads the group's
      // bits (for the index) and every candidate value directly. Products with
      // no other consumer drop out of the compiled program entirely.
      for (const member of oneHotGroups[plan.groupIndex]!.members) pending.push(member)
      for (const candidate of plan.candidateWires) pending.push(candidate)
      continue
    }
    const operation = operations[operationIndex]!
    for (const [dependency] of operation.leftTerms) pending.push(dependency)
    for (const [dependency] of operation.gateTerms) pending.push(dependency)
    const read = operation.indexRead
    if (read !== undefined && !visitedTables.has(read.table)) {
      visitedTables.add(read.table)
      for (const candidate of read.table.candidates) pending.push(candidate)
    }
  }
  return liveOperations
}

// The depth of every live operation from what it reads in the compiled program:
// a lowered masked sum reads its group's bits and its candidates instead of its
// products, and an index read reads its index form and its candidates.
// Operations come after everything they read, so one pass in operation order
// suffices. Without gather plans this reproduces the build-time depths.
// Ported from index-read, kept at https://github.com/chenglou/handwired/tree/exploration-2026-09/lab/ui-exploration/index-read.
function computeCompiledDepths(
  circuit: Circuit,
  liveOperations: Uint8Array,
  gatherPlans: ReadonlyMap<number, GatherPlan>,
): Int32Array {
  const depths = new Int32Array(circuit.operations.length)
  const depthOf = (wire: Wire) => (wire < circuit.sourceSize ? 0 : depths[wire - circuit.sourceSize]!)
  const tableDepths = new Map<CandidateTable, number>()
  for (let operationIndex = 0; operationIndex < circuit.operations.length; operationIndex++) {
    if (liveOperations[operationIndex] === 0) continue
    let depth = 0
    const plan = gatherPlans.get(operationIndex)
    if (plan === undefined) {
      const operation = circuit.operations[operationIndex]!
      for (const [wire] of operation.leftTerms) depth = Math.max(depth, depthOf(wire))
      for (const [wire] of operation.gateTerms) depth = Math.max(depth, depthOf(wire))
      const read = operation.indexRead
      if (read !== undefined) {
        // Every candidate comes before the table's first read, so its depth is
        // final by then and later reads can reuse the table's depth.
        let tableDepth = tableDepths.get(read.table)
        if (tableDepth === undefined) {
          tableDepth = 0
          for (const candidate of read.table.candidates) tableDepth = Math.max(tableDepth, depthOf(candidate))
          tableDepths.set(read.table, tableDepth)
        }
        depth = Math.max(depth, tableDepth)
      }
    } else {
      for (const member of circuit.oneHotGroups[plan.groupIndex]!.members) depth = Math.max(depth, depthOf(member))
      for (const candidate of plan.candidateWires) depth = Math.max(depth, depthOf(candidate))
    }
    depths[operationIndex] = depth + 1
  }
  return depths
}

// Register a candidates array once per circuit: check every candidate, record
// the deepest one, and freeze the array so a later change throws instead of
// silently changing reads that were already built. Arrays with the same
// content share one table, e.g. a table rebuilt with .map in every loop
// iteration.
function registerCandidateTable(circuit: Circuit, candidates: readonly Wire[]): CandidateTable {
  const registered = circuit.candidateTablesByArray.get(candidates)
  if (registered !== undefined) return registered
  invariant(candidates.length > 0, 'an index read needs at least one candidate')
  const width = circuit.sourceSize + circuit.operations.length
  let maximumDepth = 0
  for (const candidate of candidates) {
    assertWire(candidate, width)
    maximumDepth = Math.max(maximumDepth, circuit.depths[candidate]!)
  }
  Object.freeze(candidates)
  const contentKey = candidates.join(',')
  let table = circuit.candidateTablesByContent.get(contentKey)
  if (table === undefined) {
    table = {id: circuit.candidateTablesByContent.size, candidates, maximumDepth, rangeByReach: new Map()}
    circuit.candidateTablesByContent.set(contentKey, table)
    for (const candidate of candidates) circuit.hasReaders[candidate] = true
  }
  circuit.candidateTablesByArray.set(candidates, table)
  return table
}

// The union of the ranges of every candidate an index within indexRange can
// reach, plus 0 where a side that reads zero is reachable. Cached per table and
// reachable span, so a large table read many times is scanned once per span.
// Narrowing a candidate's range after a read keeps the wider union for later
// reads with the same span, which is still a sound bound.
function indexReadRange(
  table: CandidateTable,
  indexRange: NumericRange,
  below: OutOfRange,
  above: OutOfRange,
  ranges: readonly NumericRange[],
): NumericRange {
  const {candidates} = table
  const count = candidates.length
  const lowestPosition = Math.max(-1, Math.min(count, Math.floor(indexRange.minimum)))
  const highestPosition = Math.max(-1, Math.min(count, Math.floor(indexRange.maximum)))
  const key = `${lowestPosition},${highestPosition},${below},${above}`
  let range = table.rangeByReach.get(key)
  if (range === undefined) {
    let minimum = Number.POSITIVE_INFINITY
    let maximum = Number.NEGATIVE_INFINITY
    const include = (candidateRange: NumericRange) => {
      minimum = Math.min(minimum, candidateRange.minimum)
      maximum = Math.max(maximum, candidateRange.maximum)
    }
    const lastDirectPosition = Math.min(highestPosition, count - 1)
    for (let position = Math.max(lowestPosition, 0); position <= lastDirectPosition; position++) {
      include(ranges[candidates[position]!]!)
    }
    const zeroRange = {minimum: 0, maximum: 0}
    if (lowestPosition < 0) include(below === 'zero' ? zeroRange : ranges[candidates[0]!]!)
    if (highestPosition > count - 1) include(above === 'zero' ? zeroRange : ranges[candidates[count - 1]!]!)
    range = {minimum, maximum}
    table.rangeByReach.set(key, range)
  }
  // Each wire gets its own object, since assumeRange replaces a wire's range.
  return {minimum: range.minimum, maximum: range.maximum}
}

// Store a candidate table as a base position and a stride when the candidates
// sit at evenly spaced packed positions, e.g. a run of source cells, a reversed
// run, or one repeated wire; otherwise store one position per candidate. Ported
// from index-read, where a 10,000-row list read into 24 slots stored no positions
// (lab/ui-exploration/lists/README.md, "Merged from index-read").
function packCandidateTable(
  table: CandidateTable,
  packedIndexByWire: Int32Array,
  availableValues: number,
): PackedCandidateTable {
  const positions = table.candidates.map(candidate => {
    const position = packedIndexByWire[candidate]!
    invariant(position >= 0 && position < availableValues, 'index read candidate is not available')
    return position
  })
  const base = positions[0]!
  const stride = positions.length > 1 ? positions[1]! - base : 0
  let evenlySpaced = true
  for (let position = 2; position < positions.length; position++) {
    if (positions[position] !== base + position * stride) {
      evenlySpaced = false
      break
    }
  }
  return {
    candidateCount: positions.length,
    candidateBase: base,
    candidateStride: stride,
    candidatePositions: evenlySpaced ? new Uint8Array(0) : compactUnsignedIndices(positions),
  }
}

type MaskedProduct = {
  coefficient: number
  leftWire: Wire
  gateWire: Wire
  gateCoefficient: number
  exactMultiply: boolean
}

// Undo the builder's affine composition for one side of a reglu. Small affine
// wires (fewer than affineShareThreshold terms) are inlined into consumers, so
// a product against such a wire stores the wire's expanded definition rather
// than a single reference. The builder's own deduplication map recovers the
// defining wire: an expanded copy serializes to exactly the key under which
// that wire was registered. sign -1 means the side equals the negated wire
// (the negative arm of a mixed-sign multiply stores gate terms scaled by -1).
function resolveAffineSide(
  circuit: Circuit,
  terms: Terms,
  bias: number,
  allowNegated: boolean,
): {wire: Wire, sign: number} | undefined {
  if (bias === 0 && terms.length === 1) {
    const [wire, coefficient] = terms[0]!
    if (coefficient === 1) return {wire, sign: 1}
    if (coefficient === -1 && allowNegated) return {wire, sign: -1}
    // Other coefficients may still be some wire's whole definition; fall
    // through to the deduplication lookup.
  }
  if (terms.length === 0) return undefined
  const direct = circuit.expressionWires.get(
    serializeExpression('affine', terms, bias, [], 0),
  )
  if (direct !== undefined) return {wire: direct, sign: 1}
  if (!allowNegated) return undefined
  const negatedTerms: Terms = terms.map(([wire, coefficient]) => [wire, -coefficient])
  const negated = circuit.expressionWires.get(
    serializeExpression('affine', negatedTerms, -bias, [], 0),
  )
  if (negated !== undefined) return {wire: negated, sign: -1}
  return undefined
}

// Parse one term of a candidate masked sum. A usable product is a reglu whose
// left side is some wire (possibly stored as that wire's inlined definition)
// and whose gate side is a wire or its negation — exactly the shapes
// emitMultiply builds for bit * value across the orientations it picks.
function parseMaskedProduct(circuit: Circuit, wire: Wire, coefficient: number): MaskedProduct | undefined {
  if (wire < circuit.sourceSize) return undefined
  const operation = circuit.operations[wire - circuit.sourceSize]!
  if (operation.macro?.kind === 'multiply') {
    return {coefficient, leftWire: operation.macro.left, gateWire: operation.macro.right, gateCoefficient: 1, exactMultiply: true}
  }
  if (operation.kind !== 'reglu') return undefined
  const left = resolveAffineSide(circuit, operation.leftTerms, operation.leftBias, false)
  if (left === undefined) return undefined
  const gate = resolveAffineSide(circuit, operation.gateTerms, operation.gateBias, true)
  if (gate === undefined) return undefined
  return {coefficient, leftWire: left.wire, gateWire: gate.wire, gateCoefficient: gate.sign, exactMultiply: false}
}

// Recognize dynamic-lookup idioms: an affine whose terms are products of a
// declared one-hot group against value wires, covering every group position
// exactly once. Such a sum accumulates fround(0 * value) = 0 for every
// non-selected position plus the selected value itself, so an indexed read of
// the selected candidate reproduces it bit-for-bit (execution-model.md states the
// contract, and gather-lowering.test.ts checks its adversarial cases).
function planGatherLowering(circuit: Circuit): Map<number, GatherPlan> {
  const plans = new Map<number, GatherPlan>()
  if (circuit.oneHotGroups.length === 0) return plans
  const groupsByWire = new Map<Wire, number[]>()
  const positionsByGroup = circuit.oneHotGroups.map((group, groupIndex) => {
    const positions = new Map<Wire, number>()
    for (let position = 0; position < group.members.length; position++) {
      const member = group.members[position]!
      positions.set(member, position)
      const groups = groupsByWire.get(member)
      if (groups === undefined) groupsByWire.set(member, [groupIndex])
      else groups.push(groupIndex)
    }
    return positions
  })
  for (let operationIndex = 0; operationIndex < circuit.operations.length; operationIndex++) {
    const operation = circuit.operations[operationIndex]!
    if (operation.kind !== 'affine' || operation.leftTerms.length === 0) continue
    const products: MaskedProduct[] = []
    let parsed = true
    for (const [wire, coefficient] of operation.leftTerms) {
      if (coefficient !== 1 && coefficient !== -1) {
        parsed = false
        break
      }
      const product = parseMaskedProduct(circuit, wire, coefficient)
      if (product === undefined) {
        parsed = false
        break
      }
      products.push(product)
    }
    if (!parsed) continue
    // Every term of a matching sum references the group through its left or
    // gate wire, so the first product's groups are the only ones to try.
    const first = products[0]!
    const candidateGroups = new Set([
      ...groupsByWire.get(first.gateWire) ?? [],
      ...groupsByWire.get(first.leftWire) ?? [],
    ])
    for (const groupIndex of candidateGroups) {
      const candidateWires = attemptGatherMatch(
        circuit,
        products,
        circuit.oneHotGroups[groupIndex]!,
        positionsByGroup[groupIndex]!,
      )
      if (candidateWires !== null) {
        plans.set(operationIndex, {groupIndex, candidateWires})
        break
      }
    }
  }
  return plans
}

// Lowering requires value wires with finite declared ranges. A wire whose
// range admits Infinity can poison the dense sum to NaN through a
// non-selected product (fround(Infinity * 0) is NaN) while the gather would
// skip that product entirely, so such reads must stay dense.
function hasFiniteRange(circuit: Circuit, wire: Wire): boolean {
  const range = circuit.ranges[wire]!
  return Number.isFinite(Math.fround(range.minimum)) && Number.isFinite(Math.fround(range.maximum))
}

// Try to interpret the parsed products as one complete read of the group:
// every group position must contribute exactly one value wire, and every term
// must be provably equal to that masked read in FP32. Returns the candidate
// value wires ordered by group position, or null when the sum is not a pure
// masked read of this group.
function attemptGatherMatch(
  circuit: Circuit,
  products: readonly MaskedProduct[],
  group: OneHotGroup,
  positionByMember: ReadonlyMap<Wire, number>,
): readonly Wire[] | null {
  // Index the negative arms of mixed-sign multiplies first. For a value with a
  // signed range, emitMultiply emits pos = reglu(bit; value) and
  // neg = reglu(bit; -value) and subtracts them; only the pair together reads
  // the value exactly, so each arm must find its partner.
  const negativeArms = new Map<string, {used: boolean}>()
  for (const product of products) {
    if (
      product.coefficient === -1
      && product.gateCoefficient === -1
      && positionByMember.has(product.leftWire)
      && !positionByMember.has(product.gateWire)
    ) {
      const key = `${product.leftWire}|${product.gateWire}`
      if (negativeArms.has(key)) return null
      negativeArms.set(key, {used: false})
    }
  }
  const optionsByTerm: {position: number, valueWire: Wire}[][] = []
  for (const product of products) {
    const {coefficient, leftWire, gateWire, gateCoefficient} = product
    if (coefficient === 1 && gateCoefficient === 1) {
      const options: {position: number, valueWire: Wire}[] = []
      const gatePosition = positionByMember.get(gateWire)
      // Bit in the gate: fround(value * max(0, bit)) selects any finite value.
      // The value's declared range must be finite on both ends: a range that
      // admits Infinity lets a non-selected product turn into
      // fround(Infinity * 0) = NaN and poison the dense sum, which a gather
      // would not reproduce.
      if (gatePosition !== undefined && hasFiniteRange(circuit, leftWire)) {
        options.push({position: gatePosition, valueWire: leftWire})
      }
      const leftPosition = positionByMember.get(leftWire)
      if (leftPosition !== undefined) {
        const negativeArm = negativeArms.get(`${leftWire}|${gateWire}`)
        if (product.exactMultiply && hasFiniteRange(circuit, gateWire)) {
          options.push({position: leftPosition, valueWire: gateWire})
        } else if (negativeArm !== undefined && !negativeArm.used && hasFiniteRange(circuit, gateWire)) {
          negativeArm.used = true
          options.push({position: leftPosition, valueWire: gateWire})
        } else if (
          circuit.ranges[gateWire]!.minimum >= 0
          && Number.isFinite(circuit.ranges[gateWire]!.maximum)
        ) {
          // Bit on the left: fround(bit * max(0, value)) reads the value only
          // when the relu is the identity, so the value must be non-negative,
          // and finite for the same NaN reason as above.
          options.push({position: leftPosition, valueWire: gateWire})
        }
      }
      if (options.length === 0) return null
      optionsByTerm.push(options)
    } else if (gateCoefficient === -1 && positionByMember.has(product.gateWire)) {
      // A bit behind a negated gate: max(0, -bit) is exactly 0 for a 0/1 bit,
      // so the term contributes a signed zero the sum ignores — unless the
      // left value could be infinite, in which case the reference computes
      // fround(Infinity * 0) = NaN instead of a zero.
      if (!hasFiniteRange(circuit, leftWire)) return null
      continue
    } else if (
      coefficient === -1
      && gateCoefficient === -1
      && positionByMember.has(leftWire)
    ) {
      // The negative arm of a mixed-sign pair, verified as used below.
      continue
    } else {
      return null
    }
  }
  for (const arm of negativeArms.values()) {
    if (!arm.used) return null
  }
  // Assign positions: fixed terms first, then terms whose bit could sit on
  // either side take whichever position is still open.
  const candidateWires = Array<Wire | undefined>(group.members.length)
  const flexibleTerms: {position: number, valueWire: Wire}[][] = []
  for (const options of optionsByTerm) {
    if (options.length === 1) {
      const {position, valueWire} = options[0]!
      if (candidateWires[position] !== undefined) return null
      candidateWires[position] = valueWire
    } else {
      flexibleTerms.push(options)
    }
  }
  for (const options of flexibleTerms) {
    let placed = false
    for (const {position, valueWire} of options) {
      if (candidateWires[position] === undefined) {
        candidateWires[position] = valueWire
        placed = true
        break
      }
    }
    if (!placed) return null
  }
  for (const candidate of candidateWires) {
    if (candidate === undefined) return null
  }
  return candidateWires as Wire[]
}

function serializeExpression(
  kind: AtomKind,
  leftTerms: Terms,
  leftBias: number,
  gateTerms: Terms,
  gateBias: number,
): string {
  const parts: (string | number)[] = [kind, leftBias]
  for (const [wire, coefficient] of leftTerms) parts.push(wire, coefficient)
  parts.push('|', gateBias)
  for (const [wire, coefficient] of gateTerms) parts.push(wire, coefficient)
  return parts.join(',')
}

// The macro's part of append's deduplication key, e.g. multiply,12,40. The
// circuit keeps every operation's key as long as the circuit lives, and most
// operations are multiplies and selects, so the key is written by hand:
// JSON.stringify would store {"kind":"multiply","left":12,"right":40} instead.
function serializeMacro(macro: Macro): string {
  switch (macro.kind) {
    case 'multiply': return `multiply,${macro.left},${macro.right}`
    case 'select': return `select,${macro.gate},${macro.off},${macro.on}`
  }
}

function identityWire(terms: Terms, bias: number): Wire | undefined {
  if (bias !== 0 || terms.length !== 1 || terms[0]![1] !== 1) return undefined
  return terms[0]![0]
}

// Keep wide sums as explicit wires so every consumer sees the same FP32 rounding
// point. Small affine forms still compose into their consumers.
const affineShareThreshold = 4

function composeAffineTerms(
  terms: Terms,
  bias: number,
  sourceSize: number,
  operations: readonly Operation[],
): [terms: Terms, bias: number] {
  const composedTerms: [wire: Wire, coefficient: number][] = []
  for (const [wire, coefficient] of terms) {
    const operation = wire < sourceSize ? undefined : operations[wire - sourceSize]
    if (
      operation?.kind !== 'affine'
      || operation.preserveRounding === true
      || operation.leftTerms.length >= affineShareThreshold
    ) {
      composedTerms.push([wire, coefficient])
      continue
    }
    bias += coefficient * operation.leftBias
    for (const [dependency, dependencyCoefficient] of operation.leftTerms) {
      composedTerms.push([dependency, coefficient * dependencyCoefficient])
    }
  }
  return [normalizeTerms(composedTerms), bias]
}

function foldConstantTerms(
  terms: Terms,
  bias: number,
  constants: readonly (number | undefined)[],
): [terms: Terms, bias: number] {
  const dynamicTerms: [wire: Wire, coefficient: number][] = []
  for (const [wire, coefficient] of terms) {
    const constant = constants[wire]
    if (constant === undefined) dynamicTerms.push([wire, coefficient])
    else bias += coefficient * constant
  }
  return [dynamicTerms, bias]
}

function normalizeTerms(terms: Terms): Terms {
  const sortedTerms = [...terms].sort(([leftWire], [rightWire]) => leftWire - rightWire)
  const normalizedTerms: [wire: Wire, coefficient: number][] = []
  for (const [wire, coefficient] of sortedTerms) {
    const previous = normalizedTerms.at(-1)
    if (previous?.[0] === wire) previous[1] += coefficient
    else normalizedTerms.push([wire, coefficient])
  }
  return normalizedTerms.filter(([, coefficient]) => coefficient !== 0)
}

function evaluateOperationStream(
  source: Float32Array,
  circuit: Circuit,
): Float32Array {
  invariant(source.length === circuit.sourceSize, 'source table has the wrong length')
  const values = new Float32Array(circuit.sourceSize + circuit.operations.length)
  values.set(source)
  for (let operationIndex = 0; operationIndex < circuit.operations.length; operationIndex++) {
    const operation = circuit.operations[operationIndex]!
    let value = evaluateTerms(values, operation.leftTerms, operation.leftBias)
    if (operation.kind === 'reglu') {
      value = Math.fround(
        value * Math.max(
          0,
          evaluateTerms(values, operation.gateTerms, operation.gateBias),
        ),
      )
    } else if (operation.kind === 'boolean') {
      value = evaluateBoolean(value)
    } else if (operation.kind === 'index') {
      value = readIndexedValue(
        values,
        operation.indexRead!,
        evaluateTerms(values, operation.gateTerms, operation.gateBias),
      )
    }
    values[circuit.sourceSize + operationIndex] = value
  }
  return values
}

function evaluateTensorProgram(
  source: Float32Array,
  program: TensorProgram,
): Float32Array {
  const workspace = createTensorWorkspace(program)
  executeTensorProgram(source, program, workspace)
  const values = new Float32Array(program.width)
  for (let packedIndex = 0; packedIndex < program.wireOrder.length; packedIndex++) {
    values[program.wireOrder[packedIndex]!] = workspace.packedValues[packedIndex]!
  }
  return values
}

function createTensorWorkspace(program: TensorProgram): TensorWorkspace {
  let maxProjectionSize = 0
  let maxInputSize = 0
  for (const layer of program.layers) {
    maxProjectionSize = Math.max(maxProjectionSize, layer.bias.length)
    maxInputSize = Math.max(maxInputSize, layer.inputSize)
  }
  return {
    packedValues: new Float32Array(program.valueCount),
    input: new Float32Array(maxInputSize),
    projection: new Float32Array(maxProjectionSize),
    gatherIndices: new Int32Array(program.gatherSlotCount),
    gatherMasses: new Float32Array(program.gatherSlotCount),
  }
}

function executeTensorProgram(
  source: Float32Array,
  program: TensorProgram,
  workspace: TensorWorkspace,
): void {
  invariant(source.length === program.sourceSize, 'source table has the wrong length')
  const {layers} = program
  const {packedValues, input, projection, gatherIndices, gatherMasses} = workspace
  packedValues.set(source)
  let availableValues = source.length
  for (const layer of layers) {
    const {outputSize} = layer
    for (let column = 0; column < layer.inputSize; column++) {
      input[column] = packedValues[layer.inputIndices[column]!]!
    }
    sparseMatmulAddBias(
      projection,
      layer.weights,
      layer.columns,
      layer.rowOffsets,
      input,
      layer.bias,
    )
    if (layer.gatherReads.length > 0) {
      applyGathers(layer, packedValues, projection, gatherIndices, gatherMasses)
    }
    if (layer.indexReads.length > 0) {
      applyIndexReads(layer, packedValues, projection)
    }
    for (let gateRow = 0; gateRow < layer.gateRows.length; gateRow++) {
      const outputRow = layer.gateRows[gateRow]!
      projection[outputRow] = Math.fround(
        projection[outputRow]! * Math.max(0, projection[outputSize + gateRow]!),
      )
    }
    for (let booleanIndex = 0; booleanIndex < layer.booleanRows.length; booleanIndex++) {
      const booleanRow = layer.booleanRows[booleanIndex]!
      projection[booleanRow] = evaluateBoolean(projection[booleanRow]!)
    }
    for (let row = 0; row < outputSize; row++) {
      packedValues[availableValues + row] = projection[row]!
    }
    availableValues += outputSize
  }
}

// Kept out of evaluateTensorProgram on purpose: with these loops inlined, the
// engine's top JIT tier fails to optimize the whole evaluation function and
// gather-heavy programs run several times slower on identical work (measured
// 3.6x-5.3x on Bun 1.3 / JavaScriptCore in July 2026 by executor-study.ts, at
// https://github.com/chenglou/handwired/blob/exploration-2026-09/lab/gather-lowering/executor-study.ts).
function applyGathers(
  layer: TensorLayer,
  packedValues: Float32Array,
  projection: Float32Array,
  gatherIndices: Int32Array,
  gatherMasses: Float32Array,
) {
  for (const compute of layer.gatherComputes) {
    // The dot of exact 0/1 bits with 0..N-1 is an exact small integer, so the
    // index and the group mass are both computed without rounding.
    let index = 0
    let mass = 0
    for (let position = 0; position < compute.bitPositions.length; position++) {
      const bit = packedValues[compute.bitPositions[position]!]!
      index += position * bit
      mass += bit
    }
    gatherIndices[compute.slot] = index
    gatherMasses[compute.slot] = mass
  }
  for (const read of layer.gatherReads) {
    // Clamp so a violated one-hot contract reads a wrong value instead of
    // reading out of bounds; an exact contract makes the clamp a no-op.
    const limit = read.candidatePositions.length - 1
    const index = Math.min(Math.max(gatherIndices[read.slot]!, 0), limit)
    let contribution = packedValues[read.candidatePositions[index]!]!
    if (read.masked) contribution = Math.fround(gatherMasses[read.slot]! * contribution)
    projection[read.row] = Math.fround(projection[read.row]! + contribution)
  }
}

// Kept out of executeTensorProgram for the same reason as applyGathers.
function applyIndexReads(
  layer: TensorLayer,
  packedValues: Float32Array,
  projection: Float32Array,
) {
  for (const read of layer.indexReads) {
    const position = resolveIndexPosition(
      projection[read.indexRow]!,
      read.candidateCount,
      read.belowZero,
      read.aboveZero,
    )
    if (position >= 0) {
      projection[read.row] = packedValues[
        read.candidatePositions.length === 0
          ? read.candidateBase + position * read.candidateStride
          : read.candidatePositions[position]!
      ]!
    } else {
      projection[read.row] = position === -1 ? 0 : Number.NaN
    }
  }
}

// floor(index) as a table position: 0..count-1 inside the table; outside it
// the nearest end, or -1 where that side reads +0; -2 for a NaN index. floor
// and the comparisons run in float64 on an FP32 value, so nothing rounds, e.g.
// an index of 3.999 (the FP32 value nearest it) reads position 3.
function resolveIndexPosition(
  index: number,
  count: number,
  belowZero: boolean,
  aboveZero: boolean,
): number {
  if (Number.isNaN(index)) return -2
  const position = Math.floor(index)
  if (position < 0) return belowZero ? -1 : 0
  if (position > count - 1) return aboveZero ? -1 : count - 1
  return position
}

// The index read instruction on one index value: copy the selected candidate's
// FP32 value, +0 where that side reads zero, and NaN for a NaN index.
function readIndexedValue(values: Float32Array, read: IndexRead, index: number): number {
  const position = resolveIndexPosition(
    index,
    read.table.candidates.length,
    read.below === 'zero',
    read.above === 'zero',
  )
  if (position >= 0) return values[read.table.candidates[position]!]!
  return position === -1 ? 0 : Number.NaN
}

function sparseMatmulAddBias(
  output: Float32Array,
  weights: Float32Array,
  columns: UnsignedIndexArray,
  rowOffsets: UnsignedIndexArray,
  input: Float32Array,
  bias: Float32Array,
) {
  for (let row = 0; row < bias.length; row++) {
    let value = bias[row]!
    for (let index = rowOffsets[row]!; index < rowOffsets[row + 1]!; index++) {
      const product = Math.fround(weights[index]! * input[columns[index]!]!)
      value = Math.fround(value + product)
    }
    output[row] = value
  }
}

function evaluateTerms(
  values: Float32Array,
  terms: Terms,
  bias: number,
): number {
  let value = Math.fround(bias)
  for (const [wire, coefficient] of terms) {
    value = Math.fround(
      value + Math.fround(Math.fround(coefficient) * values[wire]!),
    )
  }
  return value
}

function accumulateTermGradients(
  gradients: Float32Array,
  terms: Terms,
  outputGradient: number,
) {
  for (const [wire, coefficient] of terms) {
    gradients[wire] = Math.fround(
      gradients[wire]! + Math.fround(outputGradient * Math.fround(coefficient)),
    )
  }
}

function evaluateBoolean(value: number): number {
  // FP32 rounds to whole numbers at this size; the odd base makes 0.5 round up.
  const base = 8_388_609
  const score = Math.fround(value)
  const shifted = Math.fround(score + base)
  return Math.fround(shifted - base)
}

function compactUnsignedIndices(values: ArrayLike<number>): UnsignedIndexArray {
  let maximum = 0
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!
    invariant(Number.isInteger(value) && value >= 0, 'index must be a nonnegative integer')
    maximum = Math.max(maximum, value)
  }
  if (maximum <= 0xff) return Uint8Array.from(values)
  if (maximum <= 0xffff) return Uint16Array.from(values)
  return Uint32Array.from(values)
}

export function emitRelu(circuit: Circuit, value: Wire): Wire {
  return circuit.reglu([], 1, [[value, 1]], 0)
}

export function emitMultiply(circuit: Circuit, a: Wire, b: Wire): Wire {
  return circuit.multiply(a, b)
}

export function emitMaximum(circuit: Circuit, a: Wire, b: Wire): Wire {
  const difference = circuit.roundAffine([[a, 1], [b, -1]])
  const result = circuit.roundAffine([[b, 1], [emitRelu(circuit, difference), 1]])
  const aRange = circuit.ranges[a]!
  const bRange = circuit.ranges[b]!
  // In [0,1], subtraction error is below the midpoint above 1, so the
  // reconstruction cannot round above 1. This does not imply exact max.
  if (aRange.minimum >= 0 && aRange.maximum <= 1 && bRange.minimum >= 0 && bRange.maximum <= 1) {
    circuit.assumeRange(result, 0, 1)
  }
  return result
}

export function emitMinimum(circuit: Circuit, a: Wire, b: Wire): Wire {
  const difference = circuit.roundAffine([[a, 1], [b, -1]])
  const result = circuit.roundAffine([[a, 1], [emitRelu(circuit, difference), -1]])
  // For finite nonnegative operands, rounded max(0, a-b) is within [0,a].
  // The result may undershoot min(a,b), so retain only this weaker bound.
  if (circuit.isNonNegative(a) && circuit.isNonNegative(b) && hasFiniteRange(circuit, a) && hasFiniteRange(circuit, b)) {
    circuit.assumeRange(result, 0, Math.fround(circuit.ranges[a]!.maximum))
  }
  return result
}

export function emitSelect(circuit: Circuit, gate: Wire, off: Wire, on: Wire): Wire {
  return circuit.select(gate, off, on)
}

export type Relation = '>' | '>=' | '<' | '<=' | '==='

export type CompareOptions = {
  // End with a boolean atom instead of a ReLU stage, e.g. [a > b] for operands
  // within 0..16,384 takes 13 layers instead of 15, and [a >= b] on a 1/64
  // grid is one atom. Needs an executor that keeps FP32 rounding at the atom,
  // and backpropagateReference rejects the atom unless booleanGradient is
  // 'straight-through'.
  endWithBoolean?: boolean
}

const compareRelations: ReadonlySet<string> = new Set<Relation>(['>', '>=', '<', '<=', '==='])

type SignTest = 'greater' | 'atLeast' | 'equal'

// One side of a comparison. A constant has no wire, a range of one value, and
// the grid of its value, or Infinity for 0, which lies on every grid.
type CompareOperand = {
  wire: Wire | undefined
  value: number
  range: NumericRange
  grid: number | undefined
}

// [a relation b] as an exact bit, e.g. emitCompare(circuit, pointerX, '>=',
// windowLeft), equal to JavaScript's comparison of the two wires' FP32 values
// for every pair of values within the declared ranges. A threshold is a
// constant wire, e.g. emitCompare(circuit, openWindowCount, '>',
// circuit.affine([], 3)), which folds into the bias. JavaScript compares an FP32
// value with a threshold that isn't an FP32 value, e.g. 5/24, like it compares
// with the smallest FP32 value at or above it, not like f(5 / 24), which is
// below 5/24, so pick the FP32 threshold before building. The form comes from
// declarations, not from the call site:
// - Both operands need finite declared ranges. The builder refuses an open
//   range, e.g. a raw requestAnimationFrame timestamp.
// - When both operands lie on grids (see assumeGrid) and the ranges stay within
//   2^24 grid steps, the bit is built from the integer D = (a - b) / grid, e.g.
//   [a >= b] is relu(1 - relu(-D)), which equals relu(D + 1) - relu(D) at every
//   integer, in 2 operations and 2 layers.
// - Otherwise the difference d = f(a - b) stays its own operation, and a sign
//   cascade lifts every nonzero d, down to 2^-149, to at least 1 in stages that
//   multiply by powers of two and clamp, with no rounding inside. E.g. [a >= b]
//   for operands within 0..16,384 is 15 operations and 14 layers.
// Every operation built here is recorded as a rounding point, of kind 'integer
// bit' or 'sign cascade' by construction, and emitFirstActive counts the returned
// bit as a proven bit. The operands are read as wires, so a small affine operand,
// which readers normally copy in, becomes its own operation.
export function emitCompare(
  circuit: Circuit,
  a: Wire,
  relation: Relation,
  b: Wire,
  options: CompareOptions = {},
): Wire {
  invariant(compareRelations.has(relation), `comparison relation must be >, >=, <, <= or ===, got ${String(relation)}`)
  let left = compareOperand(circuit, a)
  let right = compareOperand(circuit, b)
  if (relation === '<' || relation === '<=') [left, right] = [right, left]
  const test: SignTest = relation === '>' || relation === '<'
    ? 'greater'
    : relation === '===' ? 'equal' : 'atLeast'
  if (left.wire === undefined && right.wire === undefined) {
    const holds = test === 'greater'
      ? left.value > right.value
      : test === 'atLeast' ? left.value >= right.value : left.value === right.value
    return circuit.affine([], holds ? 1 : 0)
  }
  for (const operand of [left, right]) {
    const {minimum, maximum} = operand.range
    if (!(Number.isFinite(minimum) && Number.isFinite(maximum))) {
      invariant(false, `emitCompare needs finite declared ranges on both operands, got ${minimum}..${maximum}`)
    }
  }
  // A wire equals itself for every value its finite declared range allows. This
  // comes after the range check, since a wire with an open range can be NaN,
  // e.g. Infinity × 0, and NaN >= NaN is false.
  if (left.wire === right.wire) return circuit.affine([], test === 'greater' ? 0 : 1)
  const differenceBound = Math.max(
    Math.abs(left.range.maximum - right.range.minimum),
    Math.abs(left.range.minimum - right.range.maximum),
  )
  // Rounding is monotone, so every f(a - b) stays within f(differenceBound).
  invariant(
    Number.isFinite(Math.fround(differenceBound)),
    'the difference of the declared operand ranges can overflow FP32',
  )
  const terms: [wire: Wire, coefficient: number][] = []
  if (left.wire !== undefined) terms.push([left.wire, 1])
  if (right.wire !== undefined) terms.push([right.wire, -1])
  // At most one side is a constant, so the bias is exactly that constant or its negation.
  const bias = left.value - right.value
  const endWithBoolean = options.endWithBoolean === true
  const bit = emitGridCompare(circuit, left, right, terms, bias, test, endWithBoolean)
    ?? emitCascadeCompare(circuit, terms, bias, Math.fround(differenceBound), test, endWithBoolean)
  circuit.assumeRange(bit, 0, 1)
  circuit.assumeGrid(bit, 1)
  // Both constructions end with an operation, a ReGLU product or a boolean atom.
  if (bit >= circuit.sourceSize) circuit.operations[bit - circuit.sourceSize]!.comparisonBit = true
  return bit
}

function compareOperand(circuit: Circuit, operand: Wire): CompareOperand {
  assertWire(operand, circuit.sourceSize + circuit.operations.length)
  const constant = circuit.constants[operand]
  if (constant !== undefined) {
    // A constant wire holds f(bias).
    const value = Math.fround(constant)
    invariant(Number.isFinite(value), 'a constant comparison operand must be finite')
    return constantOperand(value)
  }
  return {wire: operand, value: 0, range: circuit.ranges[operand]!, grid: circuit.grids[operand]}
}

function constantOperand(value: number): CompareOperand {
  // -0 and +0 compare equal, so a zero constant becomes +0.
  const normalized = value === 0 ? 0 : value
  return {
    wire: undefined,
    value: normalized,
    range: {minimum: normalized, maximum: normalized},
    grid: normalized === 0 ? Number.POSITIVE_INFINITY : lowestPowerOfTwo(normalized),
  }
}

// Integer bits for operands on grids. D = (a - b) / grid is an integer, and
// every product and partial sum below is an integer number of grid steps within
// 2^24, so nothing rounds, and float64, reordered or fused sums give the same
// bits (lab/ui-exploration/guide/examples/comparisons/rewrites.ts measured this
// for relu(D + 1) - relu(D)). Returns undefined when an operand has no grid or
// the ranges are too wide, and emitCompare then builds a sign cascade.
function emitGridCompare(
  circuit: Circuit,
  left: CompareOperand,
  right: CompareOperand,
  terms: Terms,
  bias: number,
  test: SignTest,
  endWithBoolean: boolean,
): Wire | undefined {
  if (left.grid === undefined || right.grid === undefined) return undefined
  const grid = Math.min(left.grid, right.grid)
  // The largest partial sum of sign × D + offset in stored order, bias first,
  // in grid steps. Every partial sum is an integer number of grid steps, so a
  // float64 bound that is at most a power of two can't hide a larger integer.
  const largestSteps = (sign: number, offset: number) => largestPartialSum(
    terms.map(([wire, coefficient]) => [wire, sign * coefficient / grid]),
    sign * bias / grid + offset,
    circuit.ranges,
  )
  const emitted: Wire[] = []
  let bit: Wire
  if (endWithBoolean) {
    // text-editing's one-atom integer comparison, now in code-points' grapheme-integer-circuits.ts: the score
    // 0.5 + (D - offset) × 2^-24, added bias first, is a multiple of 2^-24 within
    // 0.25..0.75 while every partial sum stays within 2^22 grid steps, which FP32
    // represents exactly. So D = 0 scores exactly 0.5 and rounds to 1, and
    // D = -1 scores 0.5 - 2^-24 and rounds to 0.
    const scoreScale = 2 ** -24 / grid
    const fits = test === 'equal'
      ? largestSteps(1, 0) <= 2 ** 22 && largestSteps(-1, 0) <= 2 ** 22
      : largestSteps(1, test === 'greater' ? -1 : 0) <= 2 ** 22
    if (!(fits && scoreScale >= smallestGrid && scoreScale <= largestGrid)) return undefined
    const emitAtom = (sign: number, offset: number) => {
      const atom = circuit.append(
        'boolean',
        terms.map(([wire, coefficient]) => [wire, sign * coefficient * scoreScale]),
        0.5 + (sign * bias / grid - offset) * 2 ** -24,
        [],
        0,
        {preserveRounding: true},
      )
      emitted.push(atom)
      return atom
    }
    if (test === 'equal') {
      bit = circuit.reglu([], 1, [[emitAtom(1, 0), 1], [emitAtom(-1, 0), 1]], -1)
      emitted.push(bit)
    } else {
      bit = emitAtom(1, test === 'greater' ? 1 : 0)
    }
  } else {
    const scale = 1 / grid
    // The bit's own sum, 1 - ramp, adds one more step.
    const fits = test === 'equal'
      ? largestSteps(1, 0) < exactGridSteps && largestSteps(-1, 0) < exactGridSteps
      : largestSteps(-1, test === 'greater' ? 1 : 0) < exactGridSteps
    if (!(fits && scale <= largestGrid)) return undefined
    // relu(sign × D + offset), reading the operand wires as written.
    bit = emitIntegerBit(circuit, test, emitted, (sign, offset) => circuit.append(
      'reglu',
      [],
      1,
      terms.map(([wire, coefficient]) => [wire, sign * coefficient * scale]),
      sign * bias / grid + offset,
      {preserveRounding: true},
    ))
  }
  for (const wire of emitted) recordRoundingPoint(circuit, wire, 'integer bit')
  return bit
}

// The largest magnitude of any product or partial sum of bias + Σ coefficient ×
// operand, added in stored order, from the declared operand ranges.
function largestPartialSum(terms: Terms, bias: number, ranges: readonly NumericRange[]) {
  let minimum = bias
  let maximum = bias
  let largest = Math.abs(bias)
  for (const [wire, coefficient] of terms) {
    const range = ranges[wire]!
    const low = coefficient >= 0 ? coefficient * range.minimum : coefficient * range.maximum
    const high = coefficient >= 0 ? coefficient * range.maximum : coefficient * range.minimum
    minimum += low
    maximum += high
    largest = Math.max(largest, Math.abs(low), Math.abs(high), Math.abs(minimum), Math.abs(maximum))
  }
  return largest
}

// The exact bit of D > 0, D >= 0 or D === 0, when every value of D is 0 or at
// least 1 away from 0, e.g. an integer. emitRamp(sign, offset) builds
// relu(sign × D + offset):
// - D >= 0 is relu(1 - relu(-D)), which equals relu(D + 1) - relu(D) there.
// - D > 0 is relu(1 - relu(1 - D)).
// - D === 0 is relu(1 - relu(D) - relu(-D)).
// The bit is a ReGLU product rather than a sum of ReLUs, so readers can't copy
// large ReLU values into their own sums, the pitfall lab/ui-exploration/input
// and lists hit with the sum form.
function emitIntegerBit(
  circuit: Circuit,
  test: SignTest,
  emitted: Wire[],
  emitRamp: (sign: number, offset: number) => Wire,
): Wire {
  const ramps = test === 'equal'
    ? [emitRamp(1, 0), emitRamp(-1, 0)]
    : [emitRamp(-1, test === 'greater' ? 1 : 0)]
  const bit = circuit.reglu([], 1, ramps.map(ramp => [ramp, -1]), 1)
  emitted.push(...ramps, bit)
  return bit
}

// Every nonzero FP32 difference, down to 2^-149, lifted to at least 1.
const fullLiftExponent = 149
// Every nonzero FP32 difference lifted to at least 2^-45, which a final
// rounding stage with scale 2^22 resolves.
const roundingStageLiftExponent = 104

type CascadeStage = {scale: number, limit: number}

// Stages of min(limit, scale × input), ported from planSignCascade in
// lab/ui-exploration/guide/examples/comparisons/sign-cascade.ts. Multiplying by
// a power of two only changes the exponent, and min(limit, x) = x - relu(x - limit)
// is exact while x is at most 2^24 × limit, since x - limit is an FP32 value
// there. So the first stage multiplies as far as the difference bound allows,
// each later stage by up to 2^24, until the product of the scales reaches
// 2^liftExponent. A bound above 2^24 first comes down by up to 2^24 per stage
// without multiplying, since multiplying by less than 1 would round the smallest
// differences to 0. E.g. a bound of 16,384 with liftExponent 149 gives scales
// 2^10, 2^24, 2^24, 2^24, 2^24, 2^24 and 2^19, all with limit 1. Any finite
// bound needs at most 12 stages.
function planSignCascade(differenceBound: number, liftExponent: number): CascadeStage[] {
  const boundExponent = powerOfTwoExponentAtLeast(Math.max(differenceBound, smallestGrid))
  const stages: CascadeStage[] = []
  let limitExponent = boundExponent
  let gainExponent = 0
  while (stages.length === 0 || limitExponent > 0 || gainExponent < liftExponent) {
    const nextLimitExponent = Math.max(0, limitExponent - 24)
    // A coefficient above 2^127 isn't an FP32 value, e.g. for a bound below 2^-103.
    const room = Math.min(127, 24 + nextLimitExponent - limitExponent)
    const scaleExponent = Math.min(room, Math.max(0, liftExponent - gainExponent))
    stages.push({scale: 2 ** scaleExponent, limit: 2 ** nextLimitExponent})
    limitExponent = nextLimitExponent
    gainExponent += scaleExponent
  }
  return stages
}

// The smallest integer e with 2^e >= value, for a finite positive value.
function powerOfTwoExponentAtLeast(value: number) {
  let exponent = Math.ceil(Math.log2(value))
  while (2 ** exponent < value) exponent++
  while (2 ** (exponent - 1) >= value) exponent--
  return exponent
}

// The sign cascade on d = f(a - b), ported from
// lab/ui-exploration/guide/examples/comparisons/sign-cascade.ts, which checked
// it against JavaScript over every class of FP32 difference and found no stage
// operation that rounds. lab/trace-compiler's exactPositiveBit is the same idea
// with each multiplication as its own operation. The final stage here is one or
// two ReGLU products, e.g. relu(1 - scale × stage) for a >= b, instead of a
// clamp and a negation.
function emitCascadeCompare(
  circuit: Circuit,
  terms: Terms,
  bias: number,
  differenceBound: number,
  test: SignTest,
  endWithBoolean: boolean,
): Wire {
  const emitted: Wire[] = []
  // For finite FP32 operands, f(a - b) is 0 exactly when a === b, and otherwise
  // has the sign of a - b, since subnormal values fill the gap next to 0. A
  // comparison against 0 reads its operand directly.
  let difference: Wire
  let differenceSign: number
  if (bias === 0 && terms.length === 1) {
    ;[difference, differenceSign] = terms[0]!
  } else {
    difference = circuit.roundAffine(terms, bias)
    differenceSign = 1
    emitted.push(difference)
  }
  const stages = planSignCascade(differenceBound, endWithBoolean ? roundingStageLiftExponent : fullLiftExponent)
  // After clamp stage k, the output is min(limit_k, scale_1 × ... × scale_k ×
  // relu(sign × d)).
  const emitClampStages = (sign: number, clampStages: readonly CascadeStage[]) => {
    let stageOutput = difference
    clampStages.forEach(({scale, limit}, index) => {
      let scaledTerm: [wire: Wire, coefficient: number]
      let aboveLimit: Wire
      if (index === 0) {
        // The first stage reads the signed difference as written, and keeps only its positive side.
        const gateTerms: Terms = [[difference, sign * differenceSign * scale]]
        const scaledPositive = circuit.append('reglu', [], 1, gateTerms, 0, {preserveRounding: true})
        aboveLimit = circuit.append('reglu', [], 1, gateTerms, -limit, {preserveRounding: true})
        scaledTerm = [scaledPositive, 1]
        emitted.push(scaledPositive)
      } else {
        aboveLimit = circuit.reglu([], 1, [[stageOutput, scale]], -limit)
        scaledTerm = [stageOutput, scale]
      }
      // Its own operation: copied into the next stage, the regrouped partial sums would round.
      stageOutput = circuit.roundAffine([scaledTerm, [aboveLimit, -1]])
      circuit.assumeRange(stageOutput, 0, limit)
      emitted.push(aboveLimit, stageOutput)
    })
    return stageOutput
  }
  let bit: Wire
  if (endWithBoolean) {
    // numeric-library's final rounding stage: the clamp stages lift every
    // positive difference to at least 2^-45, and 2^22 × 2^-45 moves a score
    // next to 0.5 across 0.5.
    const scoreScale = 2 ** 22
    if (test === 'greater') {
      const stageOutput = emitClampStages(1, stages)
      // The FP32 value just below 0.5, so d = 0 rounds to 0.
      const justBelowHalf = 0.5 - 2 ** -25
      const scoreAboveZero = circuit.reglu([], 1, [[stageOutput, scoreScale]], justBelowHalf)
      const scoreAboveOne = circuit.reglu([], 1, [[stageOutput, scoreScale]], justBelowHalf - 1)
      const score = circuit.affine([[scoreAboveZero, 1], [scoreAboveOne, -1]])
      circuit.assumeRange(score, 0, 1)
      emitted.push(scoreAboveZero, scoreAboveOne)
      bit = circuit.boolean(score)
    } else {
      // a >= b scores 0.5 - 2^22 × (the stages lifting b - a), and equality also
      // subtracts the stages lifting a - b. The score stays within 0..0.5, so it
      // needs no upper clamp.
      const gateTerms: [wire: Wire, coefficient: number][] = [[emitClampStages(-1, stages), -scoreScale]]
      if (test === 'equal') gateTerms.push([emitClampStages(1, stages), -scoreScale])
      const score = circuit.reglu([], 1, gateTerms, 0.5)
      emitted.push(score)
      bit = circuit.boolean(score)
    }
    emitted.push(bit)
  } else {
    const finalScale = stages.at(-1)!.scale
    const clampStages = stages.slice(0, -1)
    if (clampStages.length === 0) {
      // One stage lifts the signed difference itself, so D = scale × d is 0 or at least 1 away from 0.
      bit = emitIntegerBit(circuit, test, emitted, (sign, offset) => circuit.append(
        'reglu',
        [],
        1,
        [[difference, sign * differenceSign * finalScale]],
        offset,
        {preserveRounding: true},
      ))
    } else if (test === 'greater') {
      // scale × stage is 0 when d <= 0, and at least 1 when d > 0.
      const notGreater = circuit.reglu([], 1, [[emitClampStages(1, clampStages), -finalScale]], 1)
      bit = circuit.reglu([], 1, [[notGreater, -1]], 1)
      emitted.push(notGreater, bit)
    } else {
      const gateTerms: [wire: Wire, coefficient: number][] = [[emitClampStages(-1, clampStages), -finalScale]]
      if (test === 'equal') gateTerms.push([emitClampStages(1, clampStages), -finalScale])
      bit = circuit.reglu([], 1, gateTerms, 1)
      emitted.push(bit)
    }
  }
  for (const wire of emitted) recordRoundingPoint(circuit, wire, 'sign cascade')
  return bit
}

// Math.min(a, b) as exactly one of the operands, e.g. 0.3 for min(1000.37, 0.3),
// where emitMinimum rebuilds the result through a rounded difference and
// returns 0.29998779. Ties return a, so the result differs from Math.min at
// most in the sign of zero. Needs finite declared ranges, like emitCompare.
// Ported from lab/ui-exploration/numeric-library/comparison.ts.
export function emitMinimumExact(circuit: Circuit, a: Wire, b: Wire): Wire {
  const aIsSmaller = emitCompare(circuit, a, '<=', b)
  const aRange = compareOperand(circuit, a).range
  const bRange = compareOperand(circuit, b).range
  return emitSelectOperand(
    circuit,
    aIsSmaller,
    b,
    a,
    Math.min(aRange.minimum, bRange.minimum),
    Math.min(aRange.maximum, bRange.maximum),
  )
}

// Math.max(a, b) as exactly one of the operands. Ties return a.
export function emitMaximumExact(circuit: Circuit, a: Wire, b: Wire): Wire {
  const aIsLarger = emitCompare(circuit, a, '>=', b)
  const aRange = compareOperand(circuit, a).range
  const bRange = compareOperand(circuit, b).range
  return emitSelectOperand(
    circuit,
    aIsLarger,
    b,
    a,
    Math.max(aRange.minimum, bRange.minimum),
    Math.max(aRange.maximum, bRange.maximum),
  )
}

// Math.min(Math.max(value, minimum), maximum), e.g. maximum when minimum > maximum.
/** @public */
export function emitClampExact(circuit: Circuit, value: Wire, minimum: Wire, maximum: Wire): Wire {
  return emitMinimumExact(circuit, emitMaximumExact(circuit, value, minimum), maximum)
}

// on × relu(bit) + off × relu(1 - bit) for an exact bit. The unselected product
// is f(off × 0) = ±0, so the sum returns the selected operand exactly, up to the
// sign of zero. The sum is an ordinary affine, so an affine reader composes it
// without changing any value. Ported from emitSelectBit in
// lab/ui-exploration/numeric-library/comparison.ts.
function emitSelectOperand(
  circuit: Circuit,
  bit: Wire,
  off: Wire,
  on: Wire,
  minimum: number,
  maximum: number,
): Wire {
  const selectedOn = circuit.reglu([[on, 1]], 0, [[bit, 1]], 0)
  const selectedOff = circuit.reglu([[off, 1]], 0, [[bit, -1]], 1)
  const result = circuit.affine([[selectedOn, 1], [selectedOff, 1]])
  circuit.assumeRange(result, minimum, maximum)
  return result
}

/** @public */
export function emitSpring(
  circuit: Circuit,
  positionSource: Wire,
  destination: Wire,
  velocitySource: Wire,
  stiffness: Wire,
  damping: Wire,
  timestep: Wire,
  settleDistance: Wire,
  settleSpeed: Wire,
  settleDistanceScale: Wire,
  settleSpeedScale: Wire,
  unit: Wire,
) {
  let position = positionSource
  let velocity = velocitySource
  for (let step = 0; step < 4; step++) {
    const displacement = circuit.affine([[position, 1], [destination, -1]])
    const springForce = emitMultiply(circuit, stiffness, displacement)
    const dampingForce = emitMultiply(circuit, damping, velocity)
    const acceleration = circuit.affine([
      [springForce, -1],
      [dampingForce, -1],
    ])
    velocity = circuit.affine([
      [velocity, 1],
      [emitMultiply(circuit, acceleration, timestep), 1],
    ])
    position = circuit.affine([
      [position, 1],
      [emitMultiply(circuit, velocity, timestep), 1],
    ])
  }

  const distanceAboveThreshold = emitRelu(circuit, circuit.affine([
    [emitAbsolute(circuit, circuit.affine([[position, 1], [destination, -1]])), 1],
    [settleDistance, -1],
  ]))
  const speedAboveThreshold = emitRelu(circuit, circuit.affine([
    [emitAbsolute(circuit, velocity), 1],
    [settleSpeed, -1],
  ]))
  const active = emitClampZeroOne(
    circuit,
    circuit.affine([
      [emitMultiply(circuit, distanceAboveThreshold, settleDistanceScale), 1],
      [emitMultiply(circuit, speedAboveThreshold, settleSpeedScale), 1],
    ]),
    unit,
  )
  return {
    position: emitSelect(circuit, active, destination, position),
    velocity: emitMultiply(circuit, active, velocity),
    active,
  }
}

// The 4 cells of a spring matrix that the host writes before each evaluation,
// once per stiffness and damping pair, e.g.
// springMatrixPower(springStepMatrix({stiffness: 290, damping: 30}), steps) from
// host-timing.ts:
//   displacement' = m[0] × displacement + m[1] × velocity
//   velocity'     = m[2] × displacement + m[3] × velocity
export type SpringMatrixWires = readonly [
  displacementFromDisplacement: Wire,
  displacementFromVelocity: Wire,
  velocityFromDisplacement: Wire,
  velocityFromVelocity: Wire,
]

// One spring's displacement from its destination and its velocity after every
// step the matrix describes, e.g. all of one evaluation's 4 ms steps at once. The
// matrix cells need finite declared ranges, e.g. ±springMatrixBound(constants)
// from host-timing.ts, so a host that writes an overflowing matrix fails the
// source range check instead of stepping springs to Infinity. Each product goes
// through circuit.multiply, so the backward pass differentiates whole products,
// including at a matrix entry of exactly 0. Cost: 14 operations in 3 layers.
// Ported from emitApplyMatrix in lab/ui-exploration/guide/examples/springs/costs.ts
// and the source-matrix springs of lab/ui-exploration/event-time/spring-bank.ts.
export function emitApplySpringMatrix(
  circuit: Circuit,
  matrix: SpringMatrixWires,
  displacement: Wire,
  velocity: Wire,
): {displacement: Wire, velocity: Wire} {
  // JavaScript callers can pass any array.
  const entryCount: number = matrix.length
  invariant(entryCount === 4, `a spring matrix needs 4 wires, got ${entryCount}`)
  for (const entry of matrix) {
    assertWire(entry, circuit.sourceSize + circuit.operations.length)
    invariant(hasFiniteRange(circuit, entry), 'spring matrix wires need finite declared ranges, e.g. ±springMatrixBound(constants)')
  }
  return {
    displacement: circuit.roundAffine([
      [circuit.multiply(matrix[0], displacement), 1],
      [circuit.multiply(matrix[1], velocity), 1],
    ]),
    velocity: circuit.roundAffine([
      [circuit.multiply(matrix[2], displacement), 1],
      [circuit.multiply(matrix[3], velocity), 1],
    ]),
  }
}

export type AnimatedSpring = {
  matrix: SpringMatrixWires
  // The spring's displacement from destinationDuringSteps, usually a state cell
  // that the previous evaluation wrote back, e.g. 0 for a spring at rest.
  displacement: Wire
  velocity: Wire
  // The destination from this evaluation's time on, after its events.
  destination: Wire
  // The destination the stored displacement is measured from, i.e. the one in
  // effect during this evaluation's steps, usually the state cell that holds the
  // destination the previous evaluation wrote back. The steps simulate time before
  // this evaluation's events, so they pull toward it. Omit it when this evaluation
  // can't change the destination, and the steps then pull toward `destination`.
  destinationDuringSteps?: Wire
}

export type AnimatedObjectOptions = {
  // An exact bit the host writes: 1 when this evaluation ends at a fixed
  // simulated settle time, e.g. PlannedEvaluation.settleCheck from host-timing.ts,
  // and 0 otherwise. The object can only settle when it is 1, so whether a
  // spring settles doesn't depend on which step counts the frames land on.
  settleCheck: Wire
  // An exact bit that pins every spring onto its destination with zero velocity,
  // e.g. while the user drags the object, or PlannedEvaluation.snap from
  // host-timing.ts when a frame would need more steps than its cap.
  snap?: Wire
  // index.ts's thresholds, 0.01 px and 0.01 px/s by default. Each must be at
  // least 2^-22, see below.
  settleDistance?: number
  settleSpeed?: number
}

export type AnimatedObject = {
  // Next state for each spring: its displacement from `destination` after this
  // evaluation, and its velocity. Write both back, and `destination` as the next
  // evaluation's destinationDuringSteps.
  displacements: Wire[]
  velocities: Wire[]
  // What to draw, destination + displacement, rounded once at the destination's
  // magnitude. Not state, so this rounding never builds up.
  positions: Wire[]
  // 1 when this evaluation checks settling and every spring is within both
  // thresholds, or when every spring is exactly at rest, i.e. every displacement
  // and velocity is ±0, e.g. right after a snap.
  settled: Wire
  // 1 while the object keeps moving: not settled and not snapped. A host stops
  // the clock once every object's active bit is 0.
  active: Wire
}

// Springs of one animated object, e.g. a window's x, y, width, height and scale,
// stepped by their matrices and settled together with one exact bit. Each spring
// stores its displacement from its destination and its velocity rather than a
// position, so FP32 rounds the state at the size of the displacement, e.g. finely
// near rest even at 100,000 px, where positions are 1/128 px apart. When the object
// settles or snaps, every displacement and velocity becomes 0, up to the sign of
// zero, so every spring lands exactly on its destination. Ported from emitSpringBox
// in lab/ui-exploration/event-time/spring-bank.ts with deferred retargeting, and
// from the displacement cells of lab/ui-exploration/instanced-items/gallery-circuit.ts.
//
// For each spring:
//   (displacement', velocity') = matrix × (displacement, velocity)
//   displacement'' = f(f(destinationDuringSteps - destination) + displacement')
// The second line rebases the displacement onto this evaluation's destination. It
// adds the destination difference first, so an unchanged destination adds exactly
// 0 and returns displacement' unchanged, and rounding happens once per retarget
// instead of once per evaluation.
//
// exceedance is the sum over springs of relu(|displacement''| - distance) and
// relu(|velocity'| - speed). A sum of nonnegative FP32 values is 0 only when every
// term is 0, so exceedance is 0 exactly when every spring is within both
// thresholds, e.g. |displacement''| <= f(0.01). atRest is 1 when every
// displacement'' and velocity' is ±0. Then settled = boolean(relu(0.5 ×
// settleCheck + 0.5 × atRest - 2^20 × exceedance)). A nonzero
// relu(|displacement''| - distance) is at least the FP32 spacing above the
// threshold, 2^-45 or more for thresholds of at least 2^-22, so 2^20 × exceedance
// moves the score below 0.5 and the atom rounds it to 0. A huge exceedance, even
// Infinity, clamps the score at 0. Exact rest settles without a settle check,
// since steps keep a spring at exact rest there until a destination changes,
// whichever step counts the frames land on.
export function emitAnimatedObject(
  circuit: Circuit,
  springs: readonly AnimatedSpring[],
  options: AnimatedObjectOptions,
): AnimatedObject {
  invariant(springs.length > 0, 'an animated object needs at least one spring')
  const width = circuit.sourceSize + circuit.operations.length
  const settleDistance = Math.fround(options.settleDistance ?? 0.01)
  const settleSpeed = Math.fround(options.settleSpeed ?? 0.01)
  for (const threshold of [settleDistance, settleSpeed]) {
    invariant(
      Number.isFinite(threshold) && threshold >= 2 ** -22,
      `settle thresholds must be finite and at least 2^-22, got ${threshold}`,
    )
  }
  for (const bit of options.snap === undefined ? [options.settleCheck] : [options.settleCheck, options.snap]) {
    assertWire(bit, width)
    const range = circuit.ranges[bit]!
    invariant(range.minimum >= 0 && range.maximum <= 1, 'settleCheck and snap must be declared within 0..1')
  }
  const exceedanceTerms: [wire: Wire, coefficient: number][] = []
  const restTerms: [wire: Wire, coefficient: number][] = []
  const stepped = springs.map(spring => {
    const next = emitApplySpringMatrix(circuit, spring.matrix, spring.displacement, spring.velocity)
    // Its own operation, so each threshold ReLU reads one FP32 value and a
    // nonzero ReLU is at least the spacing above the threshold.
    const displacement = spring.destinationDuringSteps === undefined || spring.destinationDuringSteps === spring.destination
      ? next.displacement
      : circuit.roundAffine([[spring.destinationDuringSteps, 1], [spring.destination, -1], [next.displacement, 1]])
    for (const [value, threshold] of [[displacement, settleDistance], [next.velocity, settleSpeed]] as const) {
      const positivePart = circuit.reglu([], 1, [[value, 1]], 0)
      const negativePart = circuit.reglu([], 1, [[value, -1]], 0)
      // relu(|value| - threshold), with |value| = relu(value) + relu(-value). One of
      // the two parts is 0, so the gate adds the same FP32 values as
      // relu(value - threshold) or relu(-value - threshold).
      exceedanceTerms.push([circuit.reglu([], 1, [[positivePart, 1], [negativePart, 1]], -threshold), 1])
      restTerms.push([positivePart, 2 ** 127], [negativePart, 2 ** 127])
    }
    return {displacement, velocity: next.velocity}
  })
  const exceedance = circuit.roundAffine(exceedanceTerms)
  // Each lifted term is 0, at least 2^127 × 2^-149 = 2^-22, or Infinity, so the
  // lifted sum is 0 exactly when every displacement'' and velocity' is ±0, and
  // relu(1 - 2^22 × liftedRest) is the atRest bit. The terms are kept as written,
  // since combining a repeated part would give the coefficient 2^128, which isn't
  // an FP32 value. The lift is a ReLU rather than an affine sum, so at exact rest
  // the backward pass stops at its corner instead of scaling gradients by 2^149.
  const liftedRest = circuit.append('reglu', [], 1, restTerms, 0, {preserveRounding: true})
  const atRest = circuit.reglu([], 1, [[liftedRest, -(2 ** 22)]], 1)
  // settleCheck and atRest first, so the partial sum is exactly 0, 0.5 or 1 before
  // the exceedance is subtracted, and 0.5 - 2^20 × 2^-45 is the FP32 value just
  // below 0.5. At exact rest the exceedance is 0. Recorded as a rounding point,
  // since the score only resolves next to 0.5 as FP32 values.
  const settledScore = circuit.append(
    'reglu',
    [],
    1,
    [[options.settleCheck, 0.5], [atRest, 0.5], [exceedance, -(2 ** 20)]],
    0,
    {preserveRounding: true},
  )
  circuit.markRoundingPoint(settledScore)
  const settled = circuit.boolean(settledScore)
  const notSettled = circuit.roundAffine([[settled, -1]], 1)
  const active = options.snap === undefined
    ? notSettled
    : circuit.multiply(notSettled, circuit.roundAffine([[options.snap, -1]], 1))
  const displacements = stepped.map(({displacement}) => circuit.multiply(displacement, active))
  return {
    displacements,
    velocities: stepped.map(({velocity}) => circuit.multiply(velocity, active)),
    positions: springs.map((spring, index) => circuit.roundAffine([[spring.destination, 1], [displacements[index]!, 1]])),
    settled,
    active,
  }
}

function emitAbsolute(circuit: Circuit, value: Wire) {
  return circuit.affine([
    [emitRelu(circuit, value), 1],
    [emitRelu(circuit, circuit.affine([[value, -1]])), 1],
  ])
}

function emitClampZeroOne(circuit: Circuit, value: Wire, unit: Wire) {
  const positive = emitRelu(circuit, value)
  const aboveOne = emitRelu(circuit, circuit.affine([[value, 1], [unit, -1]]))
  const result = circuit.affine([[positive, 1], [aboveOne, -1]])
  circuit.assumeRange(result, 0, 1)
  return result
}

type WinnerNode =
  | {mass: Wire, item: number}
  | {mass: Wire, left: WinnerNode, right: WinnerNode}

type ArgmaxNode =
  | {score: Wire, item: number}
  | {score: Wire, leftWins: Wire, left: ArgmaxNode, right: ArgmaxNode}

export function emitArgmax(
  circuit: Circuit,
  scores: readonly Wire[],
  unit: Wire,
): {selected: Wire[], score: Wire} {
  invariant(scores.length > 0, 'argmax needs at least one score')
  const unitRange = circuit.ranges[unit]!
  invariant(unitRange.minimum === 1 && unitRange.maximum === 1, 'argmax unit must equal one')
  let level = scores.map((score, item): ArgmaxNode => {
    const range = circuit.ranges[score]!
    invariant(
      range.minimum >= 0 && range.maximum <= 1,
      'argmax scores must be within zero and one',
    )
    return {score, item}
  })
  while (level.length > 1) {
    const next: ArgmaxNode[] = []
    for (let item = 0; item < level.length; item += 2) {
      const left = level[item]!
      const right = level[item + 1]
      if (right === undefined) {
        next.push(left)
        continue
      }
      // One FP32 step above 0.5 makes exact ties choose left without exceeding 1.
      const comparisonBias = 0.5000000596046448
      const comparisonScale = 0.4999999403953552
      const comparison = circuit.affine([
        [left.score, comparisonScale],
        [right.score, -comparisonScale],
      ], comparisonBias)
      circuit.assumeRange(comparison, 0, 1)
      const leftWins = circuit.boolean(comparison)
      next.push({
        score: emitSelect(circuit, leftWins, right.score, left.score),
        leftWins,
        left,
        right,
      })
    }
    level = next
  }

  const root = level[0]!
  const selected = Array<Wire>(scores.length)
  routeArgmax(circuit, root, unit, selected)
  // The tournament routes the unit down exactly one path, so the selection is
  // an exact one-hot by construction; declare it so masked reads of it can
  // lower to gathers.
  circuit.assumeOneHot(selected)
  return {selected, score: root.score}
}

function routeArgmax(
  circuit: Circuit,
  node: ArgmaxNode,
  route: Wire,
  selected: Wire[],
) {
  if ('item' in node) {
    selected[node.item] = route
    return
  }
  const leftRoute = emitMultiply(circuit, route, node.leftWins)
  const rightRoute = circuit.affine([[route, 1], [leftRoute, -1]])
  circuit.assumeRange(rightRoute, 0, 1)
  routeArgmax(circuit, node.left, leftRoute, selected)
  routeArgmax(circuit, node.right, rightRoute, selected)
}

export function emitFirstActive(
  circuit: Circuit,
  active: Wire,
  candidates: readonly Wire[],
): Wire[] {
  if (candidates.length === 0) return []
  const activeRange = circuit.ranges[active]!
  invariant(
    activeRange.minimum >= 0 && activeRange.maximum <= 1,
    'winner selection must be gated within zero and one',
  )
  let level = candidates.map((mass, item): WinnerNode => {
    const range = circuit.ranges[mass]!
    invariant(
      range.minimum >= 0 && range.maximum <= 1,
      'winner candidates must be within zero and one',
    )
    return {mass, item}
  })
  while (level.length > 1) {
    const next: WinnerNode[] = []
    for (let item = 0; item < level.length; item += 2) {
      const left = level[item]!
      const right = level[item + 1]
      next.push(right === undefined
        ? left
        : {
            mass: emitMaximum(circuit, left.mass, right.mass),
            left,
            right,
          })
    }
    level = next
  }

  const root = level[0]!
  const selected = Array<Wire>(candidates.length)
  routeWinner(circuit, root, emitMultiply(circuit, active, root.mass), selected)
  // The selection is one-hot-or-all-zero only when the gate and every
  // candidate are exact bits. Fractional scores in 0..1 are legal inputs here
  // and produce fractional masses (e.g. candidates [0.5, 0] route 0.25 to each
  // output), so declaring unconditionally would be a false contract that
  // gather lowering then miscompiles. Constant candidates can also fold
  // routing wires together, and a group needs distinct members, so those
  // degenerate selections stay undeclared as well.
  if (isProvenBit(circuit, active) && candidates.every(candidate => isProvenBit(circuit, candidate))) {
    const distinctMembers = new Set(selected)
    if (distinctMembers.size === selected.length) circuit.assumeOneHot(selected, true)
  }
  return selected
}

// A wire that provably holds an exact 0 or 1: its declared range pins it to
// one of the two values, a boolean atom produced it, emitCompare returned it, it
// belongs to a declared one-hot group (whose members are exactly 0 or 1 by
// contract, in all-zero-allowed groups too), or it's an index read whose
// reachable candidates are all proven bits, e.g. a read over a table of
// comparison bits, where a side that reads zero adds +0, which is also a bit. A
// plain 0..1 range is NOT enough — it admits fractional values — and neither is
// an operation inside emitCompare, e.g. a sign cascade stage within 0..1.
function isProvenBit(circuit: Circuit, wire: Wire): boolean {
  // Reads of reads are followed with a stack, and each wire is checked once.
  const pending = [wire]
  const visited = new Set<Wire>()
  while (pending.length > 0) {
    const current = pending.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    if (isBitByConstruction(circuit, current)) continue
    const read = current >= circuit.sourceSize ? circuit.operations[current - circuit.sourceSize]!.indexRead : undefined
    if (read === undefined) return false
    for (const candidate of reachableCandidates(read)) pending.push(candidate)
  }
  return true
}

function isBitByConstruction(circuit: Circuit, wire: Wire): boolean {
  const range = circuit.ranges[wire]!
  if (range.minimum === range.maximum && (range.minimum === 0 || range.minimum === 1)) {
    return true
  }
  if (wire >= circuit.sourceSize) {
    const operation = circuit.operations[wire - circuit.sourceSize]!
    if (operation.kind === 'boolean' || operation.comparisonBit === true) return true
  }
  for (const group of circuit.oneHotGroups) {
    if (group.members.includes(wire)) return true
  }
  return false
}

// The candidates an index read can return for an index within the range the
// builder accepted, like indexReadRange. A side that reads zero adds +0 instead
// of a candidate.
function reachableCandidates(read: IndexRead): Wire[] {
  const {candidates} = read.table
  const count = candidates.length
  const lowestPosition = Math.max(-1, Math.min(count, Math.floor(read.indexRange.minimum)))
  const highestPosition = Math.max(-1, Math.min(count, Math.floor(read.indexRange.maximum)))
  const reachable: Wire[] = []
  const lastDirectPosition = Math.min(highestPosition, count - 1)
  for (let position = Math.max(lowestPosition, 0); position <= lastDirectPosition; position++) {
    reachable.push(candidates[position]!)
  }
  if (lowestPosition < 0 && read.below === 'clamp') reachable.push(candidates[0]!)
  if (highestPosition > count - 1 && read.above === 'clamp') reachable.push(candidates[count - 1]!)
  return reachable
}

function routeWinner(
  circuit: Circuit,
  node: WinnerNode,
  route: Wire,
  selected: Wire[],
) {
  if ('item' in node) {
    selected[node.item] = route
    return
  }
  const leftRoute = emitMultiply(circuit, route, node.left.mass)
  const rightRoute = circuit.affine([[route, 1], [leftRoute, -1]])
  circuit.assumeRange(rightRoute, 0, 1)
  routeWinner(circuit, node.left, leftRoute, selected)
  routeWinner(circuit, node.right, rightRoute, selected)
}

// options.allowExistingReaders applies to the source circuit's declared ranges
// and grids landing on target wires that operations already read, e.g. a timestep that
// the target's springs read before the source circuit declares it nonnegative.
/** @public */
export function inlineCircuit(
  target: Circuit,
  source: Circuit,
  sourceWires: readonly Wire[],
  options: DeclarationOptions = {},
): Wire[] {
  invariant(sourceWires.length === source.sourceSize, 'inlined source mapping has the wrong length')
  const wireMap = [...sourceWires]
  for (let wire = 0; wire < source.sourceSize; wire++) {
    const range = source.ranges[wire]!
    target.assumeRange(sourceWires[wire]!, range.minimum, range.maximum, options)
    const grid = source.grids[wire]
    if (grid !== undefined) target.assumeGrid(sourceWires[wire]!, grid, options)
    if (source.exactBits[wire] === true) target.assumeBit(sourceWires[wire]!, options)
  }
  // Map each distinct table once, so reads of one large table share one mapped array.
  const mappedTables = new Map<CandidateTable, readonly Wire[]>()
  for (let operationIndex = 0; operationIndex < source.operations.length; operationIndex++) {
    const operation = source.operations[operationIndex]!
    const mapTerms = (terms: Terms): Terms =>
      terms.map(([wire, coefficient]) => [wireMap[wire]!, coefficient])
    let wire: Wire
    if (operation.macro?.kind === 'multiply') {
      wire = target.multiply(wireMap[operation.macro.left]!, wireMap[operation.macro.right]!)
    } else if (operation.macro?.kind === 'select') {
      wire = target.select(wireMap[operation.macro.gate]!, wireMap[operation.macro.off]!, wireMap[operation.macro.on]!)
    } else if (operation.kind === 'reglu') {
      wire = target.append('reglu',
        mapTerms(operation.leftTerms),
        operation.leftBias,
        mapTerms(operation.gateTerms),
        operation.gateBias,
        operation.preserveRounding ? {preserveRounding: true} : {},
      )
    } else if (operation.kind === 'index') {
      const read = operation.indexRead!
      let mappedCandidates = mappedTables.get(read.table)
      if (mappedCandidates === undefined) {
        mappedCandidates = read.table.candidates.map(candidate => wireMap[candidate]!)
        mappedTables.set(read.table, mappedCandidates)
      }
      // The accepted index range carries over, e.g. a range declared on a small
      // affine index that the target infers again from undeclared cells.
      wire = target.indexReadAffine(
        mapTerms(operation.gateTerms),
        operation.gateBias,
        mappedCandidates,
        read.below,
        read.above,
        {indexRange: read.indexRange},
      )
    } else if (operation.kind === 'boolean' && operation.preserveRounding) {
      // emitCompare's atom on grid operands reads its score terms directly.
      wire = target.append('boolean', mapTerms(operation.leftTerms), operation.leftBias, [], 0, {preserveRounding: true})
    } else {
      const value = operation.preserveRounding
        ? target.roundAffine(mapTerms(operation.leftTerms), operation.leftBias)
        : target.affine(mapTerms(operation.leftTerms), operation.leftBias)
      wire = operation.kind === 'boolean' ? target.boolean(value) : value
    }
    const sourceWire = source.sourceSize + operationIndex
    const range = source.ranges[sourceWire]!
    target.assumeRange(wire, range.minimum, range.maximum, options)
    const grid = source.grids[sourceWire]
    if (grid !== undefined) target.assumeGrid(wire, grid, options)
    // A marked affine can fold into a source cell in the target, e.g. when two
    // of its terms map to one wire, and a source cell has no operation to record.
    if (operation.roundingPoint !== undefined && wire >= target.sourceSize) {
      recordRoundingPoint(target, wire, operation.roundingPoint)
    }
    // The mapped operation computes the same values from the mapped operands, so
    // it still holds exactly 0 or 1.
    if (operation.comparisonBit === true && wire >= target.sourceSize) {
      target.operations[wire - target.sourceSize]!.comparisonBit = true
    }
    wireMap.push(wire)
  }
  // Declared one-hot groups survive inlining: the property is about runtime
  // values, which the mapped wires still carry.
  for (const group of source.oneHotGroups) {
    target.assumeOneHot(
      group.members.map(member => wireMap[member]!),
      group.allowAllZero,
      options,
    )
  }
  return wireMap
}

export function validateCircuit(circuit: Circuit): number {
  const wireCount = circuit.sourceSize + circuit.operations.length
  // The largest candidate wire per table, so a table read many times is scanned once.
  const largestCandidateByTable = new Map<CandidateTable, number>()
  for (let operationIndex = 0; operationIndex < circuit.operations.length; operationIndex++) {
    const operation = circuit.operations[operationIndex]!
    invariant(Number.isFinite(operation.leftBias), 'left bias must be finite')
    invariant(Number.isFinite(operation.gateBias), 'gate bias must be finite')
    validateTerms(operation.leftTerms, circuit.sourceSize + operationIndex)
    validateTerms(operation.gateTerms, circuit.sourceSize + operationIndex)
    const read = operation.indexRead
    invariant((operation.kind === 'index') === (read !== undefined), 'only index reads carry a candidate table')
    if (read === undefined) continue
    invariant(
      operation.leftTerms.length === 0 && operation.leftBias === 0,
      'an index read keeps its index form on the gate side',
    )
    invariant(operation.gateTerms.length > 0, 'an index read needs a runtime index')
    invariant(
      read.indexRange.minimum > -indexMagnitudeLimit
        && read.indexRange.minimum <= read.indexRange.maximum
        && read.indexRange.maximum < indexMagnitudeLimit,
      'an index read needs an accepted index range strictly inside ±2^24',
    )
    invariant(read.table.candidates.length > 0, 'an index read needs at least one candidate')
    let largestCandidate = largestCandidateByTable.get(read.table)
    if (largestCandidate === undefined) {
      largestCandidate = 0
      for (const candidate of read.table.candidates) {
        assertWire(candidate, wireCount)
        largestCandidate = Math.max(largestCandidate, candidate)
      }
      largestCandidateByTable.set(read.table, largestCandidate)
    }
    invariant(largestCandidate < circuit.sourceSize + operationIndex, 'index read candidates must be earlier wires')
  }
  return wireCount
}

export function validateTensorProgram(circuit: Circuit, program: TensorProgram) {
  const {layers, roots, valueCount, wireOrder, width} = program
  invariant(program.sourceSize === circuit.sourceSize, 'tensor source size mismatch')
  invariant(width === circuit.sourceSize + circuit.operations.length, 'tensor width mismatch')
  invariant(valueCount <= width, 'tensor value count exceeds circuit width')
  invariant(wireOrder.length === valueCount, 'tensor wire order size mismatch')
  const seenWires = new Uint8Array(width)
  for (let wire = 0; wire < circuit.sourceSize; wire++) {
    invariant(wireOrder[wire] === wire, 'tensor source order mismatch')
    seenWires[wire] = 1
  }
  const resolvedGatherSlots = new Uint8Array(program.gatherSlotCount)
  // Explicit candidate position arrays already checked, so reads sharing one
  // table are checked once.
  const checkedCandidatePositions = new Set<UnsignedIndexArray>()
  let availableValues = circuit.sourceSize
  for (const layer of layers) {
    const {outputSize} = layer
    invariant(outputSize > 0, 'tensor layer must produce at least one value')
    invariant(layer.inputIndices.length === layer.inputSize, 'tensor input index size mismatch')
    for (const inputIndex of layer.inputIndices) {
      invariant(inputIndex < availableValues, 'tensor layer input is not available')
    }
    const gateSize = layer.gateRows.length
    const projectionSize = outputSize + gateSize + layer.indexReads.length
    invariant(layer.bias.length === projectionSize, 'projection bias shape mismatch')
    const seenGateRows = new Uint8Array(outputSize)
    for (const gateRow of layer.gateRows) {
      invariant(gateRow < outputSize, 'gate output row is invalid')
      invariant(seenGateRows[gateRow] === 0, 'gate output row must be unique')
      seenGateRows[gateRow] = 1
    }
    const seenBooleanRows = new Uint8Array(outputSize)
    for (const booleanRow of layer.booleanRows) {
      invariant(booleanRow < outputSize, 'boolean output row is invalid')
      invariant(seenGateRows[booleanRow] === 0, 'boolean output row cannot also be gated')
      invariant(seenBooleanRows[booleanRow] === 0, 'boolean output row must be unique')
      seenBooleanRows[booleanRow] = 1
    }
    invariant(layer.rowOffsets.length === projectionSize + 1, 'sparse row offset shape mismatch')
    invariant(layer.rowOffsets[0] === 0, 'sparse row offsets must start at zero')
    invariant(layer.columns.length === layer.weights.length, 'sparse column shape mismatch')
    invariant(
      layer.rowOffsets[projectionSize] === layer.weights.length,
      'sparse row offsets must end at the stored weight count',
    )
    for (let row = 0; row < projectionSize; row++) {
      invariant(
        layer.rowOffsets[row]! <= layer.rowOffsets[row + 1]!,
        'sparse row offsets must be ordered',
      )
    }
    for (const column of layer.columns) {
      invariant(column < layer.inputSize, 'sparse matrix column is invalid')
    }
    for (const compute of layer.gatherComputes) {
      invariant(
        compute.slot >= 0 && compute.slot < program.gatherSlotCount,
        'gather slot is invalid',
      )
      invariant(resolvedGatherSlots[compute.slot] === 0, 'gather slot must be resolved exactly once')
      resolvedGatherSlots[compute.slot] = 1
      for (const bitPosition of compute.bitPositions) {
        invariant(bitPosition < availableValues, 'gather bit is not available')
      }
    }
    for (const read of layer.gatherReads) {
      invariant(read.row < outputSize, 'gather output row is invalid')
      invariant(seenGateRows[read.row] === 0, 'gather output row cannot be gated')
      invariant(seenBooleanRows[read.row] === 0, 'gather output row cannot be boolean')
      invariant(
        layer.rowOffsets[read.row] === layer.rowOffsets[read.row + 1],
        'gather output row must store no weights',
      )
      invariant(
        read.slot >= 0 && read.slot < program.gatherSlotCount && resolvedGatherSlots[read.slot] === 1,
        'gather read must follow its slot resolution',
      )
      invariant(read.candidatePositions.length > 0, 'gather read needs at least one candidate')
      for (const candidatePosition of read.candidatePositions) {
        invariant(candidatePosition < availableValues, 'gather candidate is not available')
      }
    }
    const seenReadRows = new Uint8Array(outputSize)
    for (const read of layer.gatherReads) seenReadRows[read.row] = 1
    const seenIndexRows = new Uint8Array(projectionSize)
    for (const read of layer.indexReads) {
      invariant(read.row < outputSize, 'index read output row is invalid')
      invariant(seenGateRows[read.row] === 0, 'index read output row cannot be gated')
      invariant(seenBooleanRows[read.row] === 0, 'index read output row cannot be boolean')
      invariant(seenReadRows[read.row] === 0, 'index read output row must be unique')
      seenReadRows[read.row] = 1
      invariant(
        layer.rowOffsets[read.row] === layer.rowOffsets[read.row + 1] && layer.bias[read.row] === 0,
        'index read output row must store no weights and no bias',
      )
      invariant(
        read.indexRow >= outputSize + gateSize && read.indexRow < projectionSize,
        'index row must follow the gate rows',
      )
      invariant(seenIndexRows[read.indexRow] === 0, 'index row must be unique')
      seenIndexRows[read.indexRow] = 1
      invariant(
        layer.rowOffsets[read.indexRow]! < layer.rowOffsets[read.indexRow + 1]!,
        'index row must read a runtime index',
      )
      invariant(
        Number.isInteger(read.candidateCount) && read.candidateCount > 0,
        'index read needs at least one candidate',
      )
      if (read.candidatePositions.length === 0) {
        // Evenly spaced positions lie between the first and the last, so both
        // ends being available covers every candidate.
        const lastPosition = read.candidateBase + (read.candidateCount - 1) * read.candidateStride
        invariant(
          Number.isInteger(read.candidateBase)
            && Number.isInteger(read.candidateStride)
            && read.candidateBase >= 0
            && read.candidateBase < availableValues
            && lastPosition >= 0
            && lastPosition < availableValues,
          'evenly spaced index read candidates are not available',
        )
      } else {
        invariant(read.candidatePositions.length === read.candidateCount, 'index read candidate table size mismatch')
        if (!checkedCandidatePositions.has(read.candidatePositions)) {
          for (const candidatePosition of read.candidatePositions) {
            invariant(candidatePosition < availableValues, 'index read candidate is not available')
          }
          checkedCandidatePositions.add(read.candidatePositions)
        }
      }
    }
    assertFiniteValues(layer.bias, 'projection bias')
    assertFiniteValues(layer.weights, 'projection matrix')
    for (let row = 0; row < outputSize; row++) {
      const wire = wireOrder[availableValues + row]!
      invariant(wire >= circuit.sourceSize && wire < width, 'tensor output wire is invalid')
      invariant(seenWires[wire] === 0, 'tensor wire must be written exactly once')
      seenWires[wire] = 1
    }
    availableValues += outputSize
  }
  invariant(availableValues === valueCount, 'tensor program output size mismatch')
  for (const resolved of resolvedGatherSlots) {
    invariant(resolved === 1, 'every gather slot must be resolved')
  }
  for (const root of roots) invariant(seenWires[root] === 1, 'every tensor root must be present')
}

// Check every declared one-hot group against evaluated wire values: each
// member is exactly 0 or 1 and the members sum to exactly 1 (or 0 where the
// group allows the all-zero state). Meant for tests and for checking trainer
// writebacks; the evaluators never pay this cost on their own.
/** @public */
export function validateOneHotGroups(circuit: Circuit, values: Float32Array) {
  invariant(
    values.length === circuit.sourceSize + circuit.operations.length,
    'one-hot validation needs the full wire values',
  )
  for (const group of circuit.oneHotGroups) {
    let mass = 0
    for (const member of group.members) {
      const value = values[member]!
      if (!(value === 0 || value === 1)) {
        invariant(false, `one-hot member wire ${member} must be exactly 0 or 1, got ${value}`)
      }
      mass += value
    }
    if (!(mass === 1 || (group.allowAllZero && mass === 0))) {
      invariant(false, `one-hot group must have exactly one active member, got mass ${mass}`)
    }
  }
}

// Check the promise behind every index read against evaluated wire values: the
// index form holds an integer within the range the builder accepted, including
// a range declared on the index wire, so floor changes nothing and the read
// equals a one-hot masked sum over the same table. E.g. an index built as
// scrollTop / 28 fails here at scrollTop 14. Meant for tests; the evaluators
// never pay this cost on their own.
/** @public */
export function validateIndexReads(circuit: Circuit, values: Float32Array) {
  invariant(
    values.length === circuit.sourceSize + circuit.operations.length,
    'index read validation needs the full wire values',
  )
  for (let operationIndex = 0; operationIndex < circuit.operations.length; operationIndex++) {
    const operation = circuit.operations[operationIndex]!
    if (operation.kind !== 'index') continue
    const index = evaluateTerms(values, operation.gateTerms, operation.gateBias)
    const range = operation.indexRead!.indexRange
    if (!(Number.isInteger(index) && index >= range.minimum && index <= range.maximum)) {
      invariant(
        false,
        `index read wire ${circuit.sourceSize + operationIndex} needs an integer index within `
          + `${range.minimum}..${range.maximum}, got ${index}`,
      )
    }
  }
}

// Check every declared or inferred grid against evaluated wire values: each
// wire with a grid holds a finite multiple of it. E.g. a pointer cell declared
// on a 1/64 grid fails here at 100.01. Inferred grids rest on the declared grids
// and ranges of their operands, so one false declaration can fail many wires.
// Meant for tests; the evaluators never pay this cost on their own.
/** @public */
export function validateGrids(circuit: Circuit, values: Float32Array) {
  invariant(
    values.length === circuit.sourceSize + circuit.operations.length,
    'grid validation needs the full wire values',
  )
  for (let wire = 0; wire < values.length; wire++) {
    const grid = circuit.grids[wire]
    if (grid === undefined) continue
    const value = values[wire]!
    // Dividing by a power of two is exact in float64 for these magnitudes.
    if (!(Number.isFinite(value) && Number.isInteger(value / grid))) {
      invariant(false, `wire ${wire} must be a multiple of ${grid}, got ${value}`)
    }
  }
}

// Check that no evaluated wire is NaN, and name the operation that produced the
// first NaN. Range propagation doesn't track NaN, so the builder can't refuse
// what produces one, e.g. both sides of a select always compute, and an
// overflowing side the gate doesn't pick still gives f(Infinity × 0) = NaN.
// `values` holds every wire, e.g. from evaluateReference, or from evaluateTensor,
// which leaves the wires that the compiled program removed at 0. With `roots`,
// only the roots and the wires they read, directly or through other operations,
// are checked, e.g. only the outputs that came out NaN. Meant for tests and error
// messages; the evaluators never pay this cost on their own.
/** @public */
export function validateNoNaN(circuit: Circuit, values: Float32Array, roots?: readonly Wire[]) {
  const firstNaN = describeFirstNaN(circuit, values, roots)
  if (firstNaN !== null) throw new Error(firstNaN)
}

// validateNoNaN's message, or null when no checked wire is NaN, e.g. for a caller that adds the message to its own error.
export function describeFirstNaN(circuit: Circuit, values: Float32Array, roots?: readonly Wire[]): string | null {
  invariant(
    values.length === circuit.sourceSize + circuit.operations.length,
    'NaN validation needs the full wire values',
  )
  const checked = roots === undefined ? undefined : markWiresRead(circuit, roots)
  for (let wire = 0; wire < circuit.sourceSize; wire++) {
    if (Number.isNaN(values[wire]) && checked?.[wire] !== 0) return `source cell ${wire} is NaN`
  }
  for (let operationIndex = 0; operationIndex < circuit.operations.length; operationIndex++) {
    const wire = (circuit.sourceSize + operationIndex) as Wire
    if (!Number.isNaN(values[wire]) || checked?.[wire] === 0) continue
    // Operations only read earlier wires, so the first NaN comes from inputs that aren't NaN.
    const operation = circuit.operations[operationIndex]!
    const describeTerms = (terms: Terms) => terms.map(([input]) => `wire ${input} = ${values[input]}`).join(', ')
    let description: string
    if (operation.kind === 'reglu') {
      description = `f(left × max(0, gate)) with left = ${evaluateTerms(values, operation.leftTerms, operation.leftBias)} `
        + `and gate = ${evaluateTerms(values, operation.gateTerms, operation.gateBias)}`
    } else if (operation.kind === 'index') {
      description = `an index read whose index form is NaN, from ${describeTerms(operation.gateTerms)}`
    } else {
      description = `a sum of ${describeTerms(operation.leftTerms)}`
    }
    let context = ''
    // The multiply and select that contain the operation, e.g. a select's product
    // of its unpicked side. A multiply or select contains the operation when its
    // result reads the operation and none of its operands does, so a NaN operand,
    // e.g. a sum of Infinity and -Infinity on the side the gate picks, gets no
    // context.
    let reading = markWiresReading(circuit, wire)
    for (let reader = operationIndex; reader < circuit.operations.length; reader++) {
      const macro = circuit.operations[reader]!.macro
      if (macro === undefined || reading[circuit.sourceSize + reader] === 0) continue
      const operands = macro.kind === 'multiply' ? [macro.left, macro.right] : [macro.gate, macro.off, macro.on]
      if (operands.some(operand => reading[operand] === 1)) continue
      if (macro.kind === 'multiply') {
        context += `, in multiply(wire ${macro.left} = ${values[macro.left]}, wire ${macro.right} = ${values[macro.right]})`
        reading = markWiresReading(circuit, (circuit.sourceSize + reader) as Wire)
      } else {
        context += `, in select(gate wire ${macro.gate} = ${values[macro.gate]}, off wire ${macro.off} = ${values[macro.off]}, `
          + `on wire ${macro.on} = ${values[macro.on]}). Both sides of a select always compute, so a side the gate `
          + "doesn't pick must stay finite"
        break
      }
    }
    return `wire ${wire} is the first NaN: ${description}${context}`
  }
  return null
}

// Marks the roots, and every wire they read directly or through other operations, with 1.
function markWiresRead(circuit: Circuit, roots: readonly Wire[]): Uint8Array {
  const read = new Uint8Array(circuit.sourceSize + circuit.operations.length)
  for (const root of roots) {
    assertWire(root, read.length)
    read[root] = 1
  }
  for (let operationIndex = circuit.operations.length - 1; operationIndex >= 0; operationIndex--) {
    if (read[circuit.sourceSize + operationIndex] === 1) {
      forEachInput(circuit.operations[operationIndex]!, input => {
        read[input] = 1
      })
    }
  }
  return read
}

// Marks `wire`, and every operation that reads it directly or through other operations, with 1.
function markWiresReading(circuit: Circuit, wire: Wire): Uint8Array {
  const reading = new Uint8Array(circuit.sourceSize + circuit.operations.length)
  reading[wire] = 1
  for (let operationIndex = Math.max(0, wire - circuit.sourceSize + 1); operationIndex < circuit.operations.length; operationIndex++) {
    forEachInput(circuit.operations[operationIndex]!, input => {
      if (reading[input] === 1) reading[circuit.sourceSize + operationIndex] = 1
    })
  }
  return reading
}

// Visits every wire an operation reads: its terms, and an index read's candidates.
function forEachInput(operation: Circuit['operations'][number], visit: (input: Wire) => void) {
  for (const [input] of operation.leftTerms) visit(input)
  for (const [input] of operation.gateTerms) visit(input)
  for (const candidate of operation.indexRead?.table.candidates ?? []) visit(candidate)
}

/** @public */
export function validateTensorEvaluation(
  source: Float32Array,
  circuit: Circuit,
  tensorValues: Float32Array,
) {
  const expectedValues = evaluateOperationStream(source, circuit)
  invariant(expectedValues.length === tensorValues.length, 'tensor result width mismatch')
  const program = circuit.tensorProgram ??= circuit.compileTensorProgram()
  for (const wire of program.wireOrder) {
    invariant(
      tensorValues[wire] === expectedValues[wire],
      `tensor wire ${wire} does not match the reference FP32 atom program`,
    )
  }
}

export function assertWire(wire: number, limit: number) {
  invariant(Number.isInteger(wire) && wire >= 0 && wire < limit, 'wire is outside the compiled circuit')
}

export function assertNonNegativeFinite(
  value: number | undefined,
  label: string,
  tolerance = 0,
): asserts value is number {
  invariant(
    value !== undefined && Number.isFinite(value) && value >= -tolerance,
    `${label} must be non-negative and finite, got ${value}`,
  )
}

export function assertUnitInterval(
  value: number | undefined,
  label: string,
  tolerance = 1e-9,
): asserts value is number {
  invariant(
    value !== undefined
      && Number.isFinite(value)
      && value >= -tolerance
      && value <= 1 + tolerance,
    `${label} must be within zero and one, got ${value}`,
  )
}

// An indexed loop: `for...of` over a Float32Array took about 0.5 ms per call for
// 115,000 values in Bun, most of it in the array iterator.
export function assertFiniteValues(values: ArrayLike<number>, label: string) {
  for (let index = 0; index < values.length; index++) {
    invariant(Number.isFinite(values[index]), `${label} contains a non-finite number`)
  }
}

export function validateWireView(wires: readonly Wire[], size: number, wireCount: number) {
  invariant(wires.length === size, 'output wire view has the wrong length')
  for (const wire of wires) assertWire(wire, wireCount)
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (condition !== true) throw new Error(message)
}

function validateTerms(terms: Terms, wireLimit: number) {
  for (const [wire, coefficient] of terms) {
    assertWire(wire, wireLimit)
    invariant(Number.isFinite(coefficient), 'weight must be finite')
  }
}
