import { parseObj } from '../src/core/obj.ts';

const obj = `
o BoxGlass
usemtl GlassBlue
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4
o Concrete
usemtl ConcreteGray
v 0 0 2
v 1 0 2
v 1 1 2
f 5 6 7
`;
const objects = parseObj(obj, { centerXZ: false, groundToZero: false });
if (objects.length !== 2) throw new Error(`expected 2 groups, got ${objects.length}`);
if (!objects[0].glass) throw new Error('glass group not detected');
if (objects[0].positions.length !== 18) throw new Error('glass should triangulate to 6 vertices');
if (objects[1].glass) throw new Error('concrete should not be glass');
console.log('OBJ smoke PASS', objects.map((o) => `${o.name}:${o.positions.length / 3}v`).join(', '));
