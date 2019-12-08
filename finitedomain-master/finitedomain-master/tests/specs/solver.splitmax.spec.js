import expect from '../fixtures/mocha_proxy.fixt';
//import {
//} from '../fixtures/domain.fixt';
import {
  countSolutions,
} from '../fixtures/lib';

import Solver from '../../src/solver';

describe('solver.splitmax.spec', function() {

  it('should exist', function() {
    expect(Solver).to.be.a('function');
  });

  describe('process values by divide and conquer, high split first', function() {

    function itDistributes(solutionMap, options) {
      it(`itDistributes(o = ${JSON.stringify(options)})`, function() {
        let solver = new Solver(options);
        solver.declRange('Hello', 1, 99);
        solver.decl('World', 0);
        solver.gt('Hello', 'World');

        let solutions = solver.solve();
        expect(countSolutions(solver)).to.equal(99);

        for (let i = 0; i < solutionMap.length; ++i) {
          let val = solutionMap[i];
          expect(solutions[i].Hello, `nth: ${i} solution`).to.equal(val);
        }
        //for n, val of solutionMap
        //  expect(solutions[n].Hello, "nth: #{n} solution").to.equal val
      });
    }

    itDistributes({0: 99, 97: 2, 98: 1}, {distribute: {valueStrategy: 'splitMax'}});
    itDistributes({0: 99, 97: 2, 98: 1}, {distribute: {valueStrategy: 'splitMax', varStrategy: {type: 'naive'}}});
    itDistributes({0: 99, 97: 2, 98: 1}, {distribute: {valueStrategy: 'splitMax', varStrategy: {type: 'size'}}});
    itDistributes({0: 99, 97: 2, 98: 1}, {distribute: {valueStrategy: 'splitMax', varStrategy: {type: 'min'}}});
    itDistributes({0: 99, 97: 2, 98: 1}, {distribute: {valueStrategy: 'splitMax', varStrategy: {type: 'max'}}});
  });
});
