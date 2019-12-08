import {
  ASSERT,
  THROW,
} from './helpers';

import {
  config_addPropagator,
  config_addVarAnonNothing,
} from './config';

import propagator_markovStepBare from './propagators/markov';
import propagator_reifiedStepBare from './propagators/reified';
import propagator_ringStepBare from './propagators/ring';
import propagator_minStep from './propagators/min';
import propagator_mulStep from './propagators/mul';
import propagator_divStep from './propagators/div';
import {
  propagator_gtStepBare,
  propagator_gtStepWouldReject,
  propagator_ltStepBare,
  propagator_ltStepWouldReject,
} from './propagators/lt';
import {
  propagator_gteStepBare,
  propagator_gteStepWouldReject,
  propagator_lteStepBare,
  propagator_lteStepWouldReject,
} from './propagators/lte';
import {
  propagator_eqStepBare,
  propagator_eqStepWouldReject,
} from './propagators/eq';
import {
  propagator_neqStepBare,
  propagator_neqStepWouldReject,
} from './propagators/neq';
import {
  //domain__debug,
  domain_createEmpty,
  domain_createValue,
  domain_hasNoZero,
  domain_getValue,
  domain_invMul,
  domain_invMulValue,
  domain_isZero,
  domain_intersection,
  domain_isEmpty,
  domain_max,
  domain_min,
  domain_mul,
  domain_mulByValue,
  domain_removeGte,
  domain_removeLte,
  domain_removeValue,
  domain_resolveAsBooly,
} from './domain';
import domain_plus from './doms/domain_plus';
import domain_minus from './doms/domain_minus';

// BODY_START

/**
 * @param {string} name
 * @param {Function} stepFunc
 * @param {number} index1
 * @param {number} [index2=-1]
 * @param {number} [index3=-1]
 * @param {string} [arg1='']
 * @param {string} [arg2='']
 * @param {string} [arg3='']
 * @param {string} [arg4='']
 * @param {string} [arg5='']
 * @param {string} [arg6='']
 * @returns {$propagator}
 */
function propagator_create(name, stepFunc, index1, index2, index3, arg1, arg2, arg3, arg4, arg5, arg6) {
  return {
    _class: '$propagator',
    name: name,
    stepper: stepFunc,
    index1: index1 === undefined ? -1 : index1,
    index2: index2 === undefined ? -1 : index2,
    index3: index3 === undefined ? -1 : index3,
    arg1: arg1 === undefined ? '' : arg1,
    arg2: arg2 === undefined ? '' : arg2,
    arg3: arg3 === undefined ? '' : arg3,
    arg4: arg4 === undefined ? '' : arg4,
    arg5: arg5 === undefined ? '' : arg5,
    arg6: arg6 === undefined ? '' : arg6,
  };
}

/**
 * Adds propagators which reify the given operator application
 * to the given boolean variable.
 *
 * `opname` is a string giving the name of the comparison
 * operator to reify. Currently, 'eq', 'neq', 'lt', 'lte', 'gt' and 'gte'
 * are supported.
 *
 * `leftVarIndex` and `rightVarIndex` are the arguments accepted
 * by the comparison operator.
 *
 * `resultVarIndex` is the name of the boolean variable to which to
 * reify the comparison operator. Note that this boolean
 * variable must already have been declared. If this argument
 * is omitted from the call, then the `reified` function can
 * be used in "functional style" and will return the name of
 * the reified boolean variable which you can pass to other
 * propagator creator functions.
 *
 * @param {$config} config
 * @param {string} opname
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 * @param {number} resultVarIndex
 */
function propagator_addReified(config, opname, leftVarIndex, rightVarIndex, resultVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof opname === 'string', 'OP_SHOULD_BE_STRING');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);
  ASSERT(typeof resultVarIndex === 'number' && resultVarIndex >= 0, 'RESULT_VAR_SHOULD_BE_VALID_INDEX', resultVarIndex);

  let initialDomains = config.initialDomains;

  let A = initialDomains[leftVarIndex];
  let B = initialDomains[rightVarIndex];
  let C = initialDomains[resultVarIndex];

  // the reifier is solved if A or B is solved or if C is non-booly (zero ^ nonzero)

  let valueA = domain_getValue(A);
  let solvedA = valueA >= 0;
  let valueB = domain_getValue(B);
  let solvedB = valueB >= 0;

  let resultIsFalsy = domain_isZero(C);
  let resultIsTruthy = domain_hasNoZero(C);
  let solvedC = resultIsFalsy || resultIsTruthy;

  if (solvedA && solvedB && solvedC) return;

  let minA = domain_min(A);
  let maxA = domain_max(A);
  let minB = domain_min(B);
  let maxB = domain_max(B);
  let maxC = domain_max(C); // some of the tricks require max(C) to be 1

  // the reifier can be rewritten if any two of the three vars are solved (for C that means "non-booly")
  // the reifier might be rewritable if one var is solved
  // in some cases certain constraints can be decided without being solved ([0,4]<[5,10] always holds)
  // the actual rewrites depends on the op, though

  let nopName;
  let opFunc;
  let nopFunc;
  let opRejectChecker;
  let nopRejectChecker;
  switch (opname) {
    case 'eq': {
      // R = A ==? B
      // 1 = A ==? B        ->    A == B
      // 0 = A ==? B        ->    A != B
      // R = x ==? B        ->    check if B contains value x, solve accordingly
      // if B and R are boolean we can apply even more special rules
      // R[0 1] = 0 ==? B[0 1]   ->    R != B
      // R[0 1] = 1 ==? B[0 1]   ->    R == B
      if (solvedC) {
        if (valueA >= 0) {
          if (resultIsTruthy) initialDomains[rightVarIndex] = domain_intersection(A, B);
          else initialDomains[rightVarIndex] = domain_removeValue(B, valueA);
        } else if (valueB >= 0) {
          if (resultIsTruthy) initialDomains[leftVarIndex] = domain_intersection(A, B);
          else initialDomains[leftVarIndex] = domain_removeValue(A, valueB);
        } else {
          // neither A nor B is solved; simplify
          if (resultIsTruthy) propagator_addEq(config, leftVarIndex, rightVarIndex);
          else propagator_addNeq(config, leftVarIndex, rightVarIndex);
        }
        return;
      }
      if (valueA >= 0 && valueB >= 0) {
        initialDomains[resultVarIndex] = domain_resolveAsBooly(C, valueA === valueB);
        return;
      }
      // C isnt solved, and A and B arent both solved
      // if C is a strict bool check the cases of one side solved and other side bool
      if (maxC <= 1) {
        if (maxA <= 1 && maxB === 1) {
          if (valueA === 0) return propagator_addNeq(config, rightVarIndex, resultVarIndex);
          else if (valueA === 1) return propagator_addEq(config, rightVarIndex, resultVarIndex);
        }
        if (maxB <= 1 && maxA === 1) {
          if (valueB === 0) return propagator_addNeq(config, leftVarIndex, resultVarIndex);
          else if (valueB === 1) return propagator_addEq(config, leftVarIndex, resultVarIndex);
        }
      }

      nopName = 'neq';
      opFunc = propagator_eqStepBare;
      nopFunc = propagator_neqStepBare;
      opRejectChecker = propagator_eqStepWouldReject;
      nopRejectChecker = propagator_neqStepWouldReject;

      break;
    }

    case 'neq': {
      // similar optimizations to eq. just inversed.

      if (solvedC) { // result solved
        if (valueA >= 0) {
          if (resultIsTruthy) initialDomains[rightVarIndex] = domain_removeValue(B, valueA);
          else initialDomains[rightVarIndex] = A;
        } else if (valueB >= 0) {
          if (resultIsTruthy) initialDomains[leftVarIndex] = domain_removeValue(A, valueB);
          else initialDomains[leftVarIndex] = B;
        } else {
          // neither A nor B is solved; simplify
          if (resultIsTruthy) propagator_addNeq(config, leftVarIndex, rightVarIndex);
          else propagator_addEq(config, leftVarIndex, rightVarIndex);
        }
        return;
      }
      if (valueA >= 0 && valueB >= 0) {
        initialDomains[resultVarIndex] = domain_resolveAsBooly(C, valueA !== valueB);
        return;
      }
      // C isnt solved, and A and B arent both solved
      // if C is a strict bool check the cases of one side solved and other side bool
      if (maxC <= 1) {
        if (maxA <= 1 && maxB === 1) {
          if (valueA === 0) return propagator_addEq(config, rightVarIndex, resultVarIndex);
          else if (valueA === 1) return propagator_addNeq(config, rightVarIndex, resultVarIndex);
        }
        if (maxB <= 1 && maxA === 1) {
          if (valueB === 0) return propagator_addEq(config, leftVarIndex, resultVarIndex);
          else if (valueB === 1) return propagator_addNeq(config, leftVarIndex, resultVarIndex);
        }
      }

      nopName = 'eq';
      opFunc = propagator_neqStepBare;
      nopFunc = propagator_eqStepBare;
      opRejectChecker = propagator_neqStepWouldReject;
      nopRejectChecker = propagator_eqStepWouldReject;

      break;
    }

    case 'lt':
      // R = A <? B
      // x = A <? B             ->    reduce A and B regardless, drop constraint
      // R = x <? B             ->    check if B >= x, solve accordingly
      // R[0 1] = 0 <? B[0 1]   ->    R == B

      if (solvedC) {
        // either this resolves the constraint or we compile a non-reifier for the remainder
        if (resultIsTruthy) {
          if (maxA < minB) return;
          return propagator_addLt(config, leftVarIndex, rightVarIndex);
        }
        // C=0 so solve if all A >= all B
        if (minA >= maxB) return;
        return propagator_addGte(config, leftVarIndex, rightVarIndex);
      }
      // if C is not solved, check if the domains are already solving < as is
      if (maxA < minB) return initialDomains[resultVarIndex] = domain_resolveAsBooly(C, true);
      if (minA >= maxB) return initialDomains[resultVarIndex] = domain_resolveAsBooly(C, false);
      // rewrite trick when all args have strict bool domains
      if (maxC <= 1) {
        if (valueA === 0 && maxB <= 1) return propagator_addEq(config, rightVarIndex, resultVarIndex);
        if (valueB === 0 && maxA <= 1) return propagator_addEq(config, leftVarIndex, resultVarIndex);
      }

      opFunc = propagator_neqStepBare;
      opRejectChecker = propagator_ltStepWouldReject;
      nopName = 'gte';
      nopFunc = propagator_gteStepBare;
      nopRejectChecker = propagator_gteStepWouldReject;
      break;

    case 'lte':
      // R = A <=? B
      // x = A <=? B             ->    reduce A and B regardless, drop constraint
      // R = x <=? B             ->    check if B > x, solve accordingly
      // R[0 1] = 1 <=? B[0,1]   ->    eq(R, B)

      if (solvedC) { // result solved
        // either this resolves the constraint or we compile a non-reifier for the remainder
        if (resultIsTruthy) {
          if (maxA <= minB) return;
          return propagator_addLte(config, leftVarIndex, rightVarIndex);
        }
        // C=0 so solve if all A > all B
        if (minA > maxB) return;
        return propagator_addGt(config, leftVarIndex, rightVarIndex);
      }
      // regardless of being solved, check if the domains are already solving < as is
      if (maxA <= minB) return initialDomains[resultVarIndex] = domain_resolveAsBooly(C, true);
      if (minA > maxB) return initialDomains[resultVarIndex] = domain_resolveAsBooly(C, false);
      // rewrite trick when all args have strict bool domains
      if (maxC <= 1) {
        if (valueA === 1 && maxB <= 1) return propagator_addEq(config, rightVarIndex, resultVarIndex);
        if (valueB === 1 && maxA <= 1) return propagator_addEq(config, leftVarIndex, resultVarIndex);
      }

      opFunc = propagator_lteStepBare;
      opRejectChecker = propagator_lteStepWouldReject;
      nopName = 'gt';
      nopFunc = propagator_gtStepBare;
      nopRejectChecker = propagator_gtStepWouldReject;
      break;

    case 'gt':
      return propagator_addReified(config, 'lt', rightVarIndex, leftVarIndex, resultVarIndex);

    case 'gte':
      return propagator_addReified(config, 'lte', rightVarIndex, leftVarIndex, resultVarIndex);

    default:
      THROW('UNKNOWN_REIFIED_OP');
  }

  config_addPropagator(config, propagator_create('reified', propagator_reifiedStepBare, leftVarIndex, rightVarIndex, resultVarIndex, opFunc, nopFunc, opname, nopName, opRejectChecker, nopRejectChecker));
}

/**
 * Domain equality propagator. Creates the propagator
 * in given config.
 * Can pass in vars or numbers that become anonymous
 * vars. Must at least pass in one var because the
 * propagator would be useless otherwise.
 *
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 */
function propagator_addEq(config, leftVarIndex, rightVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);

  let initialDomains = config.initialDomains;
  let A = initialDomains[leftVarIndex];
  if (domain_getValue(A) >= 0) return initialDomains[rightVarIndex] = A;
  let B = initialDomains[rightVarIndex];
  if (domain_getValue(B) >= 0) return initialDomains[leftVarIndex] = B;

  initialDomains[leftVarIndex] = initialDomains[rightVarIndex] = domain_intersection(A, B);

  config_addPropagator(config, propagator_create('eq', propagator_eqStepBare, leftVarIndex, rightVarIndex));
}

/**
 * Less than propagator. See general propagator nores
 * for fdeq which also apply to this one.
 *
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 */
function propagator_addLt(config, leftVarIndex, rightVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);

  let initialDomains = config.initialDomains;
  let A = initialDomains[leftVarIndex];
  let B = initialDomains[rightVarIndex];

  let maxA = domain_max(A);
  let minB = domain_min(B);
  // A  |----|
  // B        |--|
  if (maxA < minB) return; // solved

  let minA = domain_min(A);
  let maxB = domain_max(B);
  // A      |----|
  // B   |--|
  if (minA >= maxB) return initialDomains[leftVarIndex] = initialDomains[rightVarIndex] = domain_createEmpty();

  // not solved nor rejected. prune invalid values

  // A  |-------|     ->     |---|
  // B  |----|               |----|
  if (maxA >= maxB) initialDomains[leftVarIndex] = domain_removeGte(A, maxB);
  // A    |-----|     ->     |----|
  // B  |-------|             |---|
  if (minB <= minA) initialDomains[rightVarIndex] = domain_removeLte(B, minA);

  config_addPropagator(config, propagator_create('lt', propagator_ltStepBare, leftVarIndex, rightVarIndex));
}

/**
 * Greater than propagator.
 *
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 */
function propagator_addGt(config, leftVarIndex, rightVarIndex) {
  // _swap_ v1 and v2 because: a>b is b<a
  propagator_addLt(config, rightVarIndex, leftVarIndex);
}

/**
 * Less than or equal to propagator.
 *
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 */
function propagator_addLte(config, leftVarIndex, rightVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);

  let initialDomains = config.initialDomains;
  let A = initialDomains[leftVarIndex];
  let B = initialDomains[rightVarIndex];

  let maxA = domain_max(A);
  let minB = domain_min(B);
  // A  |----|
  // B       |--|
  if (maxA < minB) return; // solved

  let minA = domain_min(A);
  let maxB = domain_max(B);
  // A       |----|
  // B   |--|
  if (minA > maxB) return initialDomains[leftVarIndex] = initialDomains[rightVarIndex] = domain_createEmpty();

  // not solved nor rejected. prune invalid values

  // A  |-------|     ->     |----|
  // B  |----|               |----|
  if (maxA >= maxB) initialDomains[leftVarIndex] = domain_removeGte(A, maxB + 1);
  // A    |-----|     ->     |----|
  // B  |-------|            |----|
  if (minB <= minA) initialDomains[rightVarIndex] = domain_removeLte(B, minA - 1);

  config_addPropagator(config, propagator_create('lte', propagator_lteStepBare, leftVarIndex, rightVarIndex));
}

/**
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 * @param {number} resultVarIndex
 */
function propagator_addMul(config, leftVarIndex, rightVarIndex, resultVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);
  ASSERT(typeof resultVarIndex === 'number' && resultVarIndex >= 0, 'RESULT_VAR_SHOULD_BE_VALID_INDEX', resultVarIndex);

  if (propagator_mulConstraintResolved(config, leftVarIndex, rightVarIndex, resultVarIndex)) return;

  config_addPropagator(config, propagator_create('mul', propagator_mulStep, leftVarIndex, rightVarIndex, resultVarIndex));
}

/**
 * Would a mul for given vars need a constraint?
 *
 * @param {$config} config
 * @param {number} varIndexA
 * @param {number} varIndexB
 * @param {number} varIndexC
 * @returns {boolean}
 */
function propagator_mulConstraintResolved(config, varIndexA, varIndexB, varIndexC) {
  let initialDomains = config.initialDomains;
  let A = initialDomains[varIndexA];
  let B = initialDomains[varIndexB];
  let C = initialDomains[varIndexC];

  let maxA = domain_max(A);
  let maxB = domain_max(B);

  // if A and B is unsolved just do a bounds check on result for [lo*lo, hi*hi]
  let vA = domain_getValue(A);
  let vB = domain_getValue(B);
  let vC = domain_getValue(C);
  if (vA >= 0) {
    if (vB >= 0) {
      initialDomains[varIndexC] = domain_intersection(C, domain_createValue(vA * vB));
      return true;
    }
    if (vA === 0) {
      // C must be 0 and B can be anything
      initialDomains[varIndexC] = domain_intersection(C, domain_createValue(0));
      return true;
    }
    if (vC >= 0) {
      if (vC === 0) {
        // if a is zero, b can be anything. otherwise, b must be zero (or the result couldn't be zero)
        if (vA !== 0) initialDomains[varIndexB] = domain_intersection(B, domain_createValue(0));
      } else {
        let b = (vA % vC) ? domain_createEmpty() : domain_createValue(vA / vC);
        initialDomains[varIndexB] = domain_intersection(B, b);
      }
      return true;
    }
    // C can only contain values that equals b*vA for any b in B
    // TODO: this could be dangerous if B _and_ C are very large ranges... should we guard against that?
    initialDomains[varIndexC] = domain_intersection(C, domain_mulByValue(B, vA));
    initialDomains[varIndexB] = (maxB === 0 || vA === 0) ? B : domain_intersection(B, domain_invMulValue(initialDomains[varIndexC], vA));
  } else if (vB >= 0) {
    if (vB === 0) {
      // C must be 0 and A can be anything
      initialDomains[varIndexC] = domain_intersection(C, domain_createValue(0));
      return true;
    }
    if (vC >= 0) {
      if (vC === 0) {
        // if b is zero, a can be anything. otherwise, a must be zero (or the result couldn't be zero)
        if (vB !== 0) initialDomains[varIndexA] = domain_intersection(A, domain_createValue(0));
      } else {
        let a = (vC % vB) ? domain_createEmpty() : domain_createValue(vC / vB);
        initialDomains[varIndexA] = domain_intersection(A, a);
      }
      return true;
    }
    // C can only contain values that equals a*vB for any a in A
    // TODO: this could be dangerous if A _and_ C are very large ranges... should we guard against that?
    initialDomains[varIndexC] = domain_intersection(C, domain_mulByValue(A, vB));
    initialDomains[varIndexA] = (maxA === 0 || vB === 0) ? A : domain_intersection(A, domain_invMulValue(initialDomains[varIndexC], vB));
  } else {
    // simple bounds enforcement
    initialDomains[varIndexA] = domain_intersection(A, domain_invMul(C, B));
    initialDomains[varIndexB] = domain_intersection(B, domain_invMul(C, A));
    initialDomains[varIndexC] = domain_intersection(C, domain_mul(A, B));
  }
  return false;
}

/**
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 * @param {number} resultVarIndex
 */
function propagator_addDiv(config, leftVarIndex, rightVarIndex, resultVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);
  ASSERT(typeof resultVarIndex === 'number' && resultVarIndex >= 0, 'RESULT_VAR_SHOULD_BE_VALID_INDEX', resultVarIndex);

  config_addPropagator(config, propagator_create('div', propagator_divStep, leftVarIndex, rightVarIndex, resultVarIndex));
}

/**
 * Greater than or equal to.
 *
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 */
function propagator_addGte(config, leftVarIndex, rightVarIndex) {
  // _swap_ v1 and v2 because: a>=b is b<=a
  propagator_addLte(config, rightVarIndex, leftVarIndex);
}

/**
 * Ensures that the two variables take on different values.
 *
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 */
function propagator_addNeq(config, leftVarIndex, rightVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);

  let initialDomains = config.initialDomains;
  let A = initialDomains[leftVarIndex];
  let B = initialDomains[rightVarIndex];
  let vA = domain_getValue(A);
  if (vA >= 0) return initialDomains[rightVarIndex] = domain_removeValue(B, vA);
  let vB = domain_getValue(A);
  if (vB >= 0) return initialDomains[leftVarIndex] = domain_removeValue(A, vB);

  if (domain_isEmpty(domain_intersection(A, B))) return; // no overlapping elements so constraint is redundant

  config_addPropagator(config, propagator_create('neq', propagator_neqStepBare, leftVarIndex, rightVarIndex));
}

/**
 * Takes an arbitrary number of FD variables and adds propagators that
 * ensure that they are pairwise distinct.
 *
 * @param {$config} config
 * @param {number[]} varIndexes
 */
function propagator_addDistinct(config, varIndexes) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');

  for (let i = 0; i < varIndexes.length; i++) {
    let varIndex = varIndexes[i];
    for (let j = 0; j < i; ++j) {
      propagator_addNeq(config, varIndex, varIndexes[j]);
    }
  }
}

/**
 * @param {$config} config
 * @param {string} targetOpName
 * @param {string} invOpName
 * @param {Function} opFunc
 * @param {Function} nopFunc
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 * @param {number} resultVarIndex
 */
function propagator_addRingPlusOrMul(config, targetOpName, invOpName, opFunc, nopFunc, leftVarIndex, rightVarIndex, resultVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof targetOpName === 'string', 'OP_SHOULD_BE_STRING');
  ASSERT(typeof invOpName === 'string', 'INV_OP_SHOULD_BE_STRING');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);
  ASSERT(typeof resultVarIndex === 'number' && resultVarIndex >= 0, 'RESULT_VAR_SHOULD_BE_VALID_INDEX', resultVarIndex);

  propagator_addRing(config, leftVarIndex, rightVarIndex, resultVarIndex, targetOpName, opFunc);
  propagator_addRing(config, resultVarIndex, rightVarIndex, leftVarIndex, invOpName, nopFunc);
  propagator_addRing(config, resultVarIndex, leftVarIndex, rightVarIndex, invOpName, nopFunc);
}

/**
 * @param {$config} config
 * @param {string} A
 * @param {string} B
 * @param {string} C
 * @param {string} opName
 * @param {Function} opFunc
 */
function propagator_addRing(config, A, B, C, opName, opFunc) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof A === 'number' && A >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', A);
  ASSERT(typeof B === 'number' && B >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', B);
  ASSERT(typeof C === 'number' && C >= 0, 'RESULT_VAR_SHOULD_BE_VALID_INDEX', C);

  config_addPropagator(config, propagator_create('ring', propagator_ringStepBare, A, B, C, opName, opFunc));
}

/**
 * Bidirectional addition propagator.
 *
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 * @param {number} resultVarIndex
 */
function propagator_addPlus(config, leftVarIndex, rightVarIndex, resultVarIndex) {
  propagator_addRingPlusOrMul(config, 'plus', 'min', domain_plus, domain_minus, leftVarIndex, rightVarIndex, resultVarIndex);
}

/**
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 * @param {number} resultVarIndex
 */
function propagator_addMin(config, leftVarIndex, rightVarIndex, resultVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof leftVarIndex === 'number' && leftVarIndex >= 0, 'LEFT_VAR_SHOULD_BE_VALID_INDEX', leftVarIndex);
  ASSERT(typeof rightVarIndex === 'number' && rightVarIndex >= 0, 'RIGHT_VAR_SHOULD_BE_VALID_INDEX', rightVarIndex);
  ASSERT(typeof resultVarIndex === 'number' && resultVarIndex >= 0, 'RESULT_VAR_SHOULD_BE_VALID_INDEX', resultVarIndex);

  config_addPropagator(config, propagator_create('min', propagator_minStep, leftVarIndex, rightVarIndex, resultVarIndex));
}

/**
 * Bidirectional multiplication propagator.
 *
 * @param {$config} config
 * @param {number} leftVarIndex
 * @param {number} rightVarIndex
 * @param {number} resultVarIndex
 */
function propagator_addRingMul(config, leftVarIndex, rightVarIndex, resultVarIndex) {
  if (propagator_mulConstraintResolved(config, leftVarIndex, rightVarIndex, resultVarIndex)) return;

  propagator_addRingPlusOrMul(config, 'mul', 'div', domain_mul, domain_invMul, leftVarIndex, rightVarIndex, resultVarIndex);
}

/**
 * Sum of N domains = resultVar
 * Creates as many anonymous varIndexes as necessary.
 *
 * @param {$config} config
 * @param {number[]} varIndexes
 * @param {number} resultVarIndex
 */
function propagator_addSum(config, varIndexes, resultVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(varIndexes instanceof Array, 'varIndexes should be an array of var names', varIndexes);
  ASSERT(typeof resultVarIndex === 'number' && resultVarIndex >= 0, 'RESULT_VAR_SHOULD_BE_VALID_INDEX', typeof resultVarIndex, resultVarIndex);

  let len = varIndexes.length;
  switch (len) {
    case 0:
      THROW('SUM_REQUIRES_VARS');
      return undefined;

    case 1:
      propagator_addEq(config, resultVarIndex, varIndexes[0]);
      return undefined;

    case 2:
      propagator_addPlus(config, varIndexes[0], varIndexes[1], resultVarIndex);
      return undefined;
  }

  // "divide and conquer" ugh. feels like there is a better way to do this
  ASSERT(len > 2, 'expecting at least 3 elements in the list...', varIndexes);

  let t1;
  let n = Math.floor(varIndexes.length / 2);
  if (n > 1) {
    t1 = config_addVarAnonNothing(config);
    propagator_addSum(config, varIndexes.slice(0, n), t1);
  } else {
    t1 = varIndexes[0];
  }

  let t2 = config_addVarAnonNothing(config);
  propagator_addSum(config, varIndexes.slice(n), t2);
  propagator_addPlus(config, t1, t2, resultVarIndex);
}

/**
 * Product of N varIndexes = resultVar.
 * Create as many anonymous varIndexes as necessary.
 *
 * @param {$config} config
 * @param {number[]} varIndexes
 * @param {number} resultVarIndex
 */
function propagator_addProduct(config, varIndexes, resultVarIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(varIndexes instanceof Array, 'varIndexes should be an array of var names', varIndexes);
  ASSERT(typeof resultVarIndex === 'number' && resultVarIndex >= 0, 'RESULT_VAR_SHOULD_BE_VALID_INDEX', resultVarIndex);

  switch (varIndexes.length) {
    case 0:
      THROW('PRODUCT_REQUIRES_VARS');
      return undefined;

    case 1:
      // note: by putting the result var first we get
      // the var name back for it in case it's a number
      propagator_addEq(config, resultVarIndex, varIndexes[0]);
      return undefined;

    case 2:
      propagator_addRingMul(config, varIndexes[0], varIndexes[1], resultVarIndex);
      return undefined;
  }

  let n = Math.floor(varIndexes.length / 2);
  let t1;
  if (n > 1) {
    t1 = config_addVarAnonNothing(config);
    propagator_addProduct(config, varIndexes.slice(0, n), t1);
  } else {
    t1 = varIndexes[0];
  }

  let t2 = config_addVarAnonNothing(config);
  propagator_addProduct(config, varIndexes.slice(n), t2);
  propagator_addRingMul(config, t1, t2, resultVarIndex);
}

/**
 * @param {$config} config
 * @param {number} varIndex
 */
function propagator_addMarkov(config, varIndex) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof varIndex === 'number' && varIndex >= 0, 'VAR_SHOULD_BE_VALID_INDEX', varIndex);

  config_addPropagator(config, propagator_create('markov', propagator_markovStepBare, varIndex));
}

// BODY_STOP

export {
  propagator_addDistinct,
  propagator_addDiv,
  propagator_addEq,
  propagator_addGt,
  propagator_addGte,
  propagator_addLt,
  propagator_addLte,
  propagator_addMarkov,
  propagator_addMul,
  propagator_addNeq,
  propagator_addPlus,
  propagator_addMin,
  propagator_addProduct,
  propagator_addReified,
  propagator_addRingMul,
  propagator_addSum,

  // for testing
  propagator_addRing,
  propagator_addRingPlusOrMul,
};
