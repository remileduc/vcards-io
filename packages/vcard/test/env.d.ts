// Only the test program sees Node: tsconfig.base.json sets "types": [] and the build
// config leaves test out, so an accidental node: import in the library still fails.
/// <reference types="node" />
