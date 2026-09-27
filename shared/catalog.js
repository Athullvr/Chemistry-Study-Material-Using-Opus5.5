/* The list of questions in the guide. Used by index.html (the picker) and by
   each lesson's ‹ › navigation. Add a new lesson here to make it appear.
   unitNo follows the NCERT Class 12 Chemistry (2023-24 rationalised) book. */
window.CATALOG = [
  {
    id: 'osmosis', file: 'lessons/osmosis.html', unitNo: 1, unit: 'Solutions',
    title: 'Molar mass from osmotic pressure',
    q: '200 cm³ of an aqueous solution of a protein contains 1.26 g of the protein. The osmotic pressure of this solution at 300 K is 2.57 × 10⁻³ bar. Calculate the molar mass of the protein.',
    tags: ['Numerical', 'Colligative property'], answer: '≈ 61,039 g mol⁻¹ (NCERT rounds to 61,022)', icon: 'osmosis',
  },
  {
    id: 'nernst', file: 'lessons/nernst.html', unitNo: 2, unit: 'Electrochemistry',
    title: 'EMF of a cell with the Nernst equation',
    q: 'Calculate the EMF of the cell Zn | Zn²⁺(0.001 M) ‖ Cu²⁺(0.1 M) | Cu at 298 K. E°(Zn²⁺/Zn) = −0.76 V, E°(Cu²⁺/Cu) = +0.34 V.',
    tags: ['Numerical', 'Galvanic cell'], answer: '1.159 V', icon: 'cell',
  },
  {
    id: 'first-order', file: 'lessons/first-order.html', unitNo: 3, unit: 'Chemical Kinetics',
    title: 'How long does a first-order reaction take?',
    q: 'A first order reaction has a rate constant 1.15 × 10⁻³ s⁻¹. How long will 5 g of this reactant take to reduce to 3 g?',
    tags: ['Numerical', 'Integrated rate law'], answer: '≈ 444 s', icon: 'kinetics',
  },
  {
    id: 'magnetic-moment', file: 'lessons/magnetic-moment.html', unitNo: 4, unit: 'The d- and f-Block Elements',
    title: 'Spin-only magnetic moment',
    q: "Calculate the 'spin only' magnetic moment of M²⁺(aq) ion (Z = 27).",
    tags: ['Numerical', 'Electronic configuration'], answer: 'Co²⁺ = 3d⁷, 3 unpaired → μ = √15 ≈ 3.87 BM', icon: 'dblock',
  },
  {
    id: 'crystal-field', file: 'lessons/crystal-field.html', unitNo: 5, unit: 'Coordination Compounds',
    title: 'Colour from crystal field splitting',
    q: '[Ti(H₂O)₆]³⁺ absorbs light of wavelength 498 nm. Calculate the crystal field splitting energy Δₒ (in kJ mol⁻¹) and explain why the complex looks violet.',
    tags: ['Numerical', 'Crystal field theory'], answer: 'Δₒ ≈ 240 kJ mol⁻¹', icon: 'cft',
  },
  {
    id: 'sn2', file: 'lessons/sn2.html', unitNo: 6, unit: 'Haloalkanes and Haloarenes',
    title: 'SN2 vs SN1: mechanism and stereochemistry',
    q: '(R)-2-Bromobutane is treated with aqueous NaOH. Predict the mechanism and the product, and explain what happens to the configuration in SN2 and in SN1 conditions.',
    tags: ['Mechanism', 'Stereochemistry'], answer: 'SN2 → (S)-butan-2-ol (inversion); SN1 → racemic mixture', icon: 'sn2',
  },
];
