import expect from '../../fixtures/mocha_proxy.fixt';
import {
  fixt_arrdom_range,
  fixt_dom_clone,
  fixt_dom_nums,
  fixt_dom_range,
  fixt_domainEql,
  stripAnonVarsFromArrays,
} from '../../fixtures/domain.fixt';
import {
  countSolutions,
} from '../../fixtures/lib';

import {
  LOG_FLAG_PROPSTEPS,
  LOG_FLAG_NONE,

  ASSERT_SET_LOG,
} from '../../../src/helpers';
import {
  config_addVarDomain,
  config_create,
} from '../../../src/config';
import {
  space_createRoot,
  space_initFromConfig,
} from '../../../src/space';
import Solver from '../../../src/solver';
import propagator_reifiedStepBare from '../../../src/propagators/reified';
import {
  propagator_eqStepBare,
  propagator_eqStepWouldReject,
} from '../../../src/propagators/eq';
import {
  propagator_neqStepBare,
  propagator_neqStepWouldReject,
} from '../../../src/propagators/neq';


describe('propagators/reified.spec', function() {

  // constants (tests must copy args)
  let zero = fixt_dom_nums(0);
  let one = fixt_dom_nums(1);
  let bool = fixt_dom_nums(0, 1);

  describe('propagator_reifiedStepBare', function() {
    it('should exist', function() {
      expect(propagator_reifiedStepBare).to.be.a('function');
    });

    describe('enforce=false', function() {

      // rif -> reified ;)
      function riftest(A_in, B_in, bool_in, op, invop, bool_after, msg) {
        // test one step call with two vars and an op and check results
        it(`reified_step call [${msg}] with: ${[`A=[${A_in}]`, `B=[${B_in}]`, `bool=[${bool_in}]`, `op=${op}`, `inv=${invop}`, `result=[${bool_after}]`]}`, function() {

          let config = config_create();
          config_addVarDomain(config, 'A', fixt_dom_clone(A_in, 'array'));
          config_addVarDomain(config, 'B', fixt_dom_clone(B_in, 'array'));
          config_addVarDomain(config, 'bool', fixt_dom_clone(bool_in, 'array'));
          let space = space_createRoot();
          space_initFromConfig(space, config);

          expect(op === 'eq' || op === 'neq', 'if this breaks just update the test and update the new values').to.equal(true);
          let opFunc = op === 'eq' ? propagator_eqStepBare : propagator_neqStepBare;
          let nopFunc = op !== 'eq' ? propagator_eqStepBare : propagator_neqStepBare;
          let rejectsOp = op === 'eq' ? propagator_eqStepWouldReject : propagator_neqStepWouldReject;
          let rejectsNop = op !== 'eq' ? propagator_eqStepWouldReject : propagator_neqStepWouldReject;

          let A = config.allVarNames.indexOf('A');
          let B = config.allVarNames.indexOf('B');
          let bool = config.allVarNames.indexOf('bool');
          propagator_reifiedStepBare(space, config, A, B, bool, opFunc, nopFunc, op, invop, rejectsOp, rejectsNop);

          fixt_domainEql(space.vardoms[A], A_in, 'A should be unchanged');
          fixt_domainEql(space.vardoms[B], B_in, 'B should be unchanged');
          fixt_domainEql(space.vardoms[bool], bool_after, 'bool should reflect expected outcome');
        });
      }

      describe('eq/neq with bools', function() {
        riftest(bool, bool, bool, 'eq', 'neq', bool, 'undetermined because eq/neq can only be determined when A and B are resolved');
        riftest(bool, bool, bool, 'neq', 'eq', bool, 'undetermined because eq/neq can only be determined when A and B are resolved');
        riftest(bool, zero, bool, 'eq', 'neq', bool, 'A is not resolved so not yet able to resolve bool');
        riftest(bool, zero, bool, 'neq', 'eq', bool, 'A is not resolved so not yet able to resolve bool');
        riftest(bool, one, bool, 'eq', 'neq', bool, 'A is not resolved so not yet able to resolve bool');
        riftest(bool, one, bool, 'neq', 'eq', bool, 'A is not resolved so not yet able to resolve bool');
        riftest(zero, bool, bool, 'eq', 'neq', bool, 'B is not resolved so not yet able to resolve bool');
        riftest(zero, bool, bool, 'neq', 'eq', bool, 'B is not resolved so not yet able to resolve bool');
        riftest(one, bool, bool, 'eq', 'neq', bool, 'B is not resolved so not yet able to resolve bool');
        riftest(one, bool, bool, 'neq', 'eq', bool, 'B is not resolved so not yet able to resolve bool');
        riftest(one, one, bool, 'eq', 'neq', one, 'A and B are resolved and eq so bool should be 1');
        riftest(one, one, bool, 'neq', 'eq', zero, 'A and B are resolved and not eq so bool should be 0');
        riftest(one, zero, bool, 'eq', 'neq', zero, 'A and B are resolved and not eq so bool should be 0');
        riftest(one, zero, bool, 'neq', 'eq', one, 'A and B are resolved and neq so bool should be 1');
        riftest(zero, one, bool, 'eq', 'neq', zero, 'A and B are resolved and not eq so bool should be 0');
        riftest(zero, one, bool, 'neq', 'eq', one, 'A and B are resolved and neq so bool should be 1');
        riftest(zero, zero, bool, 'eq', 'neq', one, 'A and B are resolved and eq so bool should be 1');
        riftest(zero, zero, bool, 'neq', 'eq', zero, 'A and B are resolved and not eq so bool should be 0');
      });

      describe('eq/neq with non-bools', function() {
        riftest(fixt_dom_range(0, 5), fixt_dom_range(10, 15), bool, 'eq', 'neq', zero, 'undetermined but can proof eq is impossible');
        riftest(fixt_dom_range(0, 5), fixt_dom_range(3, 8), bool, 'eq', 'neq', bool, 'undetermined but with overlap so cannot proof eq/neq yet');
        riftest(fixt_dom_range(0, 5), one, bool, 'eq', 'neq', bool, 'A is undetermined and B is in A range so cannot proof eq/neq yet');
        riftest(fixt_dom_range(110, 120), one, bool, 'eq', 'neq', zero, 'A is undetermined but B is NOT in A range must be neq');
      });
    });

    describe('with LOG', function() {

      before(function() {
        ASSERT_SET_LOG(LOG_FLAG_PROPSTEPS);
      });

      it('should improve test coverage by enabling logging', function() {
        let config = config_create();
        config_addVarDomain(config, 'A', fixt_arrdom_range(0, 1));
        config_addVarDomain(config, 'B', fixt_arrdom_range(0, 1));
        config_addVarDomain(config, 'C', fixt_arrdom_range(0, 1));
        let space = space_createRoot();
        space_initFromConfig(space, config);

        let A = config.allVarNames.indexOf('A');
        let B = config.allVarNames.indexOf('B');
        let C = config.allVarNames.indexOf('C');

        propagator_reifiedStepBare(space, config, A, B, C, propagator_eqStepBare, propagator_neqStepBare, 'eq', 'neq', propagator_eqStepWouldReject, propagator_neqStepWouldReject);

        expect(true).to.eql(true);
      });

      after(function() {
        ASSERT_SET_LOG(LOG_FLAG_NONE);
      });
    });
  });

  describe('solver test', function() {

    it('should not let reifiers influence results if they are not forced', function() {
      let solver = new Solver();

      solver.declRange('A', 0, 1);
      solver.declRange('B', 0, 1);
      solver.declRange('C', 0, 1);
      solver.isEq('A', 'B', solver.decl('AnotB', [0, 1]));

      solver.solve({});

      // a, b, c are not constrainted in any way, so 2^3=8
      expect(countSolutions(solver)).to.equal(8);
      expect(stripAnonVarsFromArrays(solver.solutions)).to.eql([
        {A: 0, B: 0, C: [0, 1], AnotB: 1},
        {A: 0, B: 1, C: [0, 1], AnotB: 0},
        {A: 1, B: 0, C: [0, 1], AnotB: 0},
        {A: 1, B: 1, C: [0, 1], AnotB: 1},
      ]);
    });

    it('should reduce vars to a solution if they are targeted expicitly', function() {
      let solver = new Solver();

      solver.declRange('A', 0, 1);
      solver.declRange('B', 0, 1);
      solver.declRange('C', 0, 1);
      solver.isEq('A', 'B', solver.decl('AnotB', [0, 1]));

      solver.solve({vars: ['A', 'B', 'C']});

      // a, b, c are not constrainted in any way, so 2^3=8
      // explicitly targeted so require a single value for all solutions
      expect(countSolutions(solver)).to.equal(8);
      expect(solver.solutions).to.eql([
        {A: 0, B: 0, C: 0, AnotB: 1},
        {A: 0, B: 0, C: 1, AnotB: 1},
        {A: 0, B: 1, C: 0, AnotB: 0},
        {A: 0, B: 1, C: 1, AnotB: 0},
        {A: 1, B: 0, C: 0, AnotB: 0},
        {A: 1, B: 0, C: 1, AnotB: 0},
        {A: 1, B: 1, C: 0, AnotB: 1},
        {A: 1, B: 1, C: 1, AnotB: 1},
      ]);
    });

    it('should be able to force a reifier to be true and affect the outcome when not targeted', function() {
      let solver = new Solver();

      solver.declRange('A', 0, 1);
      solver.declRange('B', 0, 1);
      solver.declRange('C', 0, 1);
      solver.isEq('A', 'B', solver.decl('AisB'));
      solver.eq('AisB', 1);

      solver.solve({});

      // all vars start with default domain, [0,1]
      // AisB is forced to 1
      // therefor A cannot be B
      // C is unbound
      // so the only two valid outcomes are A=0,B=1 and A=1,B=0. The value
      // for C is irrelevant so x2, the value of AisB is always 1.
      expect(countSolutions(solver)).to.equal(4);
      expect(stripAnonVarsFromArrays(solver.solutions)).to.eql([
        {A: 0, B: 0, C: [0, 1], AisB: 1},
        {A: 1, B: 1, C: [0, 1], AisB: 1},
      ]);
    });

    it('should be able to force a reifier to be true and affect the outcome when targeted', function() {
      let solver = new Solver();

      solver.declRange('A', 0, 1);
      solver.declRange('B', 0, 1);
      solver.declRange('C', 0, 1);
      solver.isEq('A', 'B', solver.decl('AisB'));
      solver.eq('AisB', 1);

      let solutions = solver.solve({vars: ['A', 'B', 'C']});

      // all vars start with default domain, [0,1]
      // AisB is forced to 1
      // therefor A cannot be B
      // C is unbound
      // so the only two valid outcomes are A=0,B=1 and A=1,B=0. The value
      // for C is irrelevant, the value of AisB is always 1. Two outcomes.
      expect(countSolutions(solver)).to.equal(4);
      // C is reduced to a single var because it is
      expect(stripAnonVarsFromArrays(solutions)).to.eql([
        {A: 0, B: 0, C: 0, AisB: 1},
        {A: 0, B: 0, C: 1, AisB: 1},
        {A: 1, B: 1, C: 0, AisB: 1},
        {A: 1, B: 1, C: 1, AisB: 1},
      ]);
    });

    it('should not adjust operands if result var is unconstrained', function() {
      let solver = new Solver();
      solver.declRange('A', 0, 10);
      solver.isEq('A', 2);
      solver.solve();

      expect(stripAnonVarsFromArrays(solver.solutions)).to.eql([
        {A: 0},
        {A: 1},
        {A: 2},
        {A: 3},
        {A: 4},
        {A: 5},
        {A: 6},
        {A: 7},
        {A: 8},
        {A: 9},
        {A: 10},
      ]);
    });

    it('should adjust operands if result var is constrained to 0', function() {
      let solver = new Solver();
      solver.declRange('A', 0, 10);
      solver.isEq('A', 2, 0);
      solver.solve();

      expect(stripAnonVarsFromArrays(solver.solutions)).to.eql([
        {A: 0},
        {A: 1},
        {A: 3},
        {A: 4},
        {A: 5},
        {A: 6},
        {A: 7},
        {A: 8},
        {A: 9},
        {A: 10},
      ]);
    });

    it('should adjust operands if result var is constrained to 1', function() {
      let solver = new Solver();
      solver.declRange('A', 0, 10);
      solver.isEq(2, 'A', 1);
      solver.solve();

      expect(stripAnonVarsFromArrays(solver.solutions)).to.eql([
        {A: 2},
      ]);
    });
  });
});
