import expect from '../../fixtures/mocha_proxy.fixt';
import {
  stripAnonVarsFromArrays,
} from '../../fixtures/domain.fixt';
import {
  countSolutions,
} from '../../fixtures/lib';

import Solver from '../../../src/solver';

describe('distribution/distribute.spec', function() {

  describe('override value distribution strategy per var', function() {

    describe('with array', function() {

      it('v1=min, v2=max', function() {

        let solver = new Solver({});
        solver.declRange('V1', 121, 124, {
          valtype: 'min',
        });
        solver.declRange('V2', 121, 124, {
          valtype: 'max',
        });
        solver.gt('V1', 120);
        solver.gt('V2', 120);

        let solutions = solver.solve();
        expect(solutions.length, 'all solutions').to.equal(16);

        // (basically V1 solves lo to hi, V2 goes hi to lo)
        expect(stripAnonVarsFromArrays(solutions)).to.eql([
          {V1: 121, V2: 124},
          {V1: 121, V2: 123},
          {V1: 121, V2: 122},
          {V1: 121, V2: 121},
          {V1: 122, V2: 124},
          {V1: 122, V2: 123},
          {V1: 122, V2: 122},
          {V1: 122, V2: 121},
          {V1: 123, V2: 124},
          {V1: 123, V2: 123},
          {V1: 123, V2: 122},
          {V1: 123, V2: 121},
          {V1: 124, V2: 124},
          {V1: 124, V2: 123},
          {V1: 124, V2: 122},
          {V1: 124, V2: 121},
        ]);
      });

      it('v1=min, v2=max (regression)', function() {

        // regression: when domains include 0, should still lead to same result

        let solver = new Solver({});
        solver.declRange('V1', 120, 124, {
          valtype: 'min',
        });
        solver.declRange('V2', 120, 124, {
          valtype: 'max',
        });
        solver.gt('V1', 120);
        solver.gt('V2', 120);

        let solutions = solver.solve();
        expect(solutions.length, 'all solutions').to.equal(16);

        // (basically V1 solves lo to hi, V2 goes hi to lo)
        expect(stripAnonVarsFromArrays(solutions)).to.eql([
          {V1: 121, V2: 124},
          {V1: 121, V2: 123},
          {V1: 121, V2: 122},
          {V1: 121, V2: 121},
          {V1: 122, V2: 124},
          {V1: 122, V2: 123},
          {V1: 122, V2: 122},
          {V1: 122, V2: 121},
          {V1: 123, V2: 124},
          {V1: 123, V2: 123},
          {V1: 123, V2: 122},
          {V1: 123, V2: 121},
          {V1: 124, V2: 124},
          {V1: 124, V2: 123},
          {V1: 124, V2: 122},
          {V1: 124, V2: 121},
        ]);
      });

      it('should pick a random() value in markov', function() {

        // note: this is pretty much the same as the previous min/max test except it uses
        // markov for it but it mimics min/max because we fixate the random() outcome

        let solver = new Solver({});
        solver.declRange('V1', 120, 124, {
          valtype: 'markov',
          legend: [121, 122, 123, 124],
          random() { return 0; }, // always take the first element
          matrix: [
            {vector: [1, 1, 1, 1]},
          ],
        });
        solver.declRange('V2', 120, 124, {
          valtype: 'markov',
          legend: [121, 122, 123, 124],
          random() { return 1 - 1e-5; }, // always take the last element
          matrix: [
            {vector: [1, 1, 1, 1]},
          ],
        });
        solver.gt('V1', 120);
        solver.gt('V2', 120);

        let solutions = solver.solve();
        expect(solutions.length, 'all solutions').to.equal(16);
        expect(stripAnonVarsFromArrays(solutions)).to.eql([
          {V1: 121, V2: 124},
          {V1: 121, V2: 123},
          {V1: 121, V2: 122},
          {V1: 121, V2: 121},
          {V1: 122, V2: 124},
          {V1: 122, V2: 123},
          {V1: 122, V2: 122},
          {V1: 122, V2: 121},
          {V1: 123, V2: 124},
          {V1: 123, V2: 123},
          {V1: 123, V2: 122},
          {V1: 123, V2: 121},
          {V1: 124, V2: 124},
          {V1: 124, V2: 123},
          {V1: 124, V2: 122},
          {V1: 124, V2: 121},
        ]);
      });
    });

    describe('with numbers', function() {

      it('v1=min, v2=max', function() {

        let solver = new Solver({});
        solver.declRange('V1', 1, 4, {
          valtype: 'min',
        });
        solver.declRange('V2', 1, 4, {
          valtype: 'max',
        });
        solver.gt('V1', 0);
        solver.gt('V2', 0);

        let solutions = solver.solve();
        expect(countSolutions(solver)).to.equal(16);

        // (basically V1 solves lo to hi, V2 goes hi to lo)
        expect(stripAnonVarsFromArrays(solutions)).to.eql([
          {V1: 1, V2: 4},
          {V1: 1, V2: 3},
          {V1: 1, V2: 2},
          {V1: 1, V2: 1},
          {V1: 2, V2: 4},
          {V1: 2, V2: 3},
          {V1: 2, V2: 2},
          {V1: 2, V2: 1},
          {V1: 3, V2: 4},
          {V1: 3, V2: 3},
          {V1: 3, V2: 2},
          {V1: 3, V2: 1},
          {V1: 4, V2: 4},
          {V1: 4, V2: 3},
          {V1: 4, V2: 2},
          {V1: 4, V2: 1},
        ]);
      });

      it('v1=min, v2=max (regression)', function() {

        // regression: when domains include 0, should still lead to same result

        let solver = new Solver({});
        solver.declRange('V1', 0, 4, {
          valtype: 'min',
        });
        solver.declRange('V2', 0, 4, {
          valtype: 'max',
        });
        solver.gt('V1', 0);
        solver.gt('V2', 0);

        let solutions = solver.solve();
        expect(countSolutions(solver)).to.equal(16);

        // (basically V1 solves lo to hi, V2 goes hi to lo)
        expect(stripAnonVarsFromArrays(solutions)).to.eql([
          {V1: 1, V2: 4},
          {V1: 1, V2: 3},
          {V1: 1, V2: 2},
          {V1: 1, V2: 1},
          {V1: 2, V2: 4},
          {V1: 2, V2: 3},
          {V1: 2, V2: 2},
          {V1: 2, V2: 1},
          {V1: 3, V2: 4},
          {V1: 3, V2: 3},
          {V1: 3, V2: 2},
          {V1: 3, V2: 1},
          {V1: 4, V2: 4},
          {V1: 4, V2: 3},
          {V1: 4, V2: 2},
          {V1: 4, V2: 1},
        ]);
      });

      it('should pick a random() value in markov', function() {

        // note: this is pretty much the same as the previous min/max test except it uses
        // markov for it but it mimics min/max because we fixate the random() outcome

        let solver = new Solver({});
        solver.declRange('V1', 0, 4, {
          valtype: 'markov',
          legend: [1, 2, 3, 4],
          random() { return 0; }, // always take the first element
          matrix: [
            {vector: [1, 1, 1, 1]},
          ],
        });
        solver.declRange('V2', 0, 4, {
          valtype: 'markov',
          legend: [1, 2, 3, 4],
          random() { return 1 - 1e-5; }, // always take the last element
          matrix: [
            {vector: [1, 1, 1, 1]},
          ],
        });
        solver.gt('V1', 0);
        solver.gt('V2', 0);

        let solutions = solver.solve();
        expect(countSolutions(solver)).to.equal(16);
        expect(stripAnonVarsFromArrays(solutions)).to.eql([
          {V1: 1, V2: 4},
          {V1: 1, V2: 3},
          {V1: 1, V2: 2},
          {V1: 1, V2: 1},
          {V1: 2, V2: 4},
          {V1: 2, V2: 3},
          {V1: 2, V2: 2},
          {V1: 2, V2: 1},
          {V1: 3, V2: 4},
          {V1: 3, V2: 3},
          {V1: 3, V2: 2},
          {V1: 3, V2: 1},
          {V1: 4, V2: 4},
          {V1: 4, V2: 3},
          {V1: 4, V2: 2},
          {V1: 4, V2: 1},
        ]);
      });
    });
  });
});
