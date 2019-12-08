// Config for a search tree where each node is a Space
// TOFIX: may want to rename this to "tree-state" or something; it's not just config

// Note: all domains in this class should be array based!
// This prevents leaking the small domain artifact outside of the library.

import {
  NO_SUCH_VALUE,
  SUB,
  SUP,

  ASSERT,
  ASSERT_NORDOM,
  ASSERT_VARDOMS_SLOW,
  THROW,
} from './helpers';
import {
  TRIE_KEY_NOT_FOUND,

  trie_add,
  trie_create,
  trie_get,
  trie_has,
} from './trie';
import {
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
} from './propagator';
import {
  NOT_FOUND,

  domain__debug,
  domain_createRange,
  domain_createValue,
  domain_getValue,
  domain_max,
  domain_min,
  domain_mul,
  domain_hasNoZero,
  domain_intersection,
  domain_isSolved,
  domain_isZero,
  domain_removeGte,
  domain_removeLte,
  domain_removeValue,
  domain_resolveAsBooly,
  domain_toSmallest,
  domain_anyToSmallest,
} from './domain';
import domain_plus from './doms/domain_plus';
import {
  constraint_create,
} from './constraint';
import distribution_getDefaults from './distribution/defaults';

// BODY_START

/**
 * @returns {$config}
 */
function config_create() {
  let config = {
    _class: '$config',
    // names of all vars in this search tree
    allVarNames: [],
    // doing `indexOf` for 5000+ names is _not_ fast. so use a trie
    _varNamesTrie: trie_create(),

    varStratConfig: config_createVarStratConfig(),
    valueStratName: 'min',
    targetedVars: 'all',
    varDistOptions: {},
    timeoutCallback: undefined,

    // this is for the rng stuff in this library. in due time all calls
    // should happen through this function. and it should be initialized
    // with the rngCode string for exportability. this would be required
    // for webworkers and DSL imports which can't have functions. tests
    // can initialize it to something static, prod can use a seeded rng.
    rngCode: '', // string. Function(rngCode) should return a callable rng
    _defaultRng: undefined, // Function. if not exist at init time it'll be `rngCode ? Function(rngCode) : Math.random`

    // the propagators are generated from the constraints when a space
    // is created from this config. constraints are more higher level.
    allConstraints: [],

    constantCache: {}, // <value:varIndex>, generally anonymous vars but pretty much first come first serve
    initialDomains: [], // $nordom[] : initial domains for each var, maps 1:1 to allVarNames

    _propagators: [], // initialized later
    _varToPropagators: [], // initialized later
    _constrainedAway: [], // list of var names that were constrained but whose constraint was optimized away. they will still be "targeted" if target is all. TODO: fix all tests that depend on this and eliminate this. it is a hack.

    _constraintHash: {}, // every constraint is logged here (note: for results only the actual constraints are stored). if it has a result, the value is the result var _name_. otherwise just `true` if it exists and `false` if it was optimized away.
  };

  ASSERT(!void (config._propagates = 0), 'number of propagate() calls');

  return config;
}

function config_clone(config, newDomains) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');

  let {
    varStratConfig,
    valueStratName,
    targetedVars,
    varDistOptions,
    timeoutCallback,
    constantCache,
    allVarNames,
    allConstraints,
    initialDomains,
    _propagators,
    _varToPropagators,
    _constrainedAway,
  } = config;

  let clone = {
    _class: '$config',
    _varNamesTrie: trie_create(allVarNames), // just create a new trie with (should be) the same names

    varStratConfig,
    valueStratName,
    targetedVars: targetedVars instanceof Array ? targetedVars.slice(0) : targetedVars,
    varDistOptions: JSON.parse(JSON.stringify(varDistOptions)),  // TOFIX: clone this more efficiently
    timeoutCallback, // by reference because it's a function if passed on...

    rngCode: config.rngCode,
    _defaultRng: config.rngCode ? undefined : config._defaultRng,

    constantCache, // is by reference ok?

    allVarNames: allVarNames.slice(0),
    allConstraints: allConstraints.slice(0),
    initialDomains: newDomains ? newDomains.map(domain_toSmallest) : initialDomains, // <varName:domain>

    _propagators: _propagators && _propagators.slice(0), // in case it is initialized
    _varToPropagators: _varToPropagators && _varToPropagators.slice(0), // inited elsewhere
    _constrainedAway: _constrainedAway && _constrainedAway.slice(0), // list of var names that were constrained but whose constraint was optimized away. they will still be "targeted" if target is all. TODO: fix all tests that depend on this and eliminate this. it is a hack.

    // not sure what to do with this in the clone...
    _constraintHash: {},
  };

  ASSERT(!void (clone._propagates = 0), 'number of propagate() calls');

  return clone;
}

/**
 * Add an anonymous var with max allowed range
 *
 * @param {$config} config
 * @returns {number} varIndex
 */
function config_addVarAnonNothing(config) {
  return config_addVarNothing(config, true);
}
/**
 * @param {$config} config
 * @param {string|boolean} varName (If true, is anonymous)
 * @returns {number} varIndex
 */
function config_addVarNothing(config, varName) {
  return _config_addVar(config, varName, domain_createRange(SUB, SUP));
}
/**
 * @param {$config} config
 * @param {number} lo
 * @param {number} hi
 * @returns {number} varIndex
 */
function config_addVarAnonRange(config, lo, hi) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof lo === 'number', 'A_LO_MUST_BE_NUMBER');
  ASSERT(typeof hi === 'number', 'A_HI_MUST_BE_NUMBER');

  if (lo === hi) return config_addVarAnonConstant(config, lo);

  return config_addVarRange(config, true, lo, hi);
}
/**
 * @param {$config} config
 * @param {string|boolean} varName (If true, is anonymous)
 * @param {number} lo
 * @param {number} hi
 * @returns {number} varIndex
 */
function config_addVarRange(config, varName, lo, hi) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof varName === 'string' || varName === true, 'A_VARNAME_SHOULD_BE_STRING_OR_TRUE');
  ASSERT(typeof lo === 'number', 'A_LO_MUST_BE_NUMBER');
  ASSERT(typeof hi === 'number', 'A_HI_MUST_BE_NUMBER');
  ASSERT(lo <= hi, 'A_RANGES_SHOULD_ASCEND');

  let domain = domain_createRange(lo, hi);
  return _config_addVar(config, varName, domain);
}
/**
 * @param {$config} config
 * @param {string|boolean} varName (If true, anon)
 * @param {$arrdom} domain Small domain format not allowed here. this func is intended to be called from Solver, which only accepts arrdoms
 * @returns {number} varIndex
 */
function config_addVarDomain(config, varName, domain, _allowEmpty, _override) {
  ASSERT(domain instanceof Array, 'DOMAIN_MUST_BE_ARRAY_HERE');

  return _config_addVar(config, varName, domain_anyToSmallest(domain), _allowEmpty, _override);
}
/**
 * @param {$config} config
 * @param {number} value
 * @returns {number} varIndex
 */
function config_addVarAnonConstant(config, value) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof value === 'number', 'A_VALUE_SHOULD_BE_NUMBER');

  if (config.constantCache[value] !== undefined) {
    return config.constantCache[value];
  }

  return config_addVarConstant(config, true, value);
}
/**
 * @param {$config} config
 * @param {string|boolean} varName (True means anon)
 * @param {number} value
 * @returns {number} varIndex
 */
function config_addVarConstant(config, varName, value) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof varName === 'string' || varName === true, 'varName must be a string or true for anon');
  ASSERT(typeof value === 'number', 'A_VALUE_SHOULD_BE_NUMBER');

  let domain = domain_createRange(value, value);

  return _config_addVar(config, varName, domain);
}

/**
 * @param {$config} config
 * @param {string|true} varName If true, the varname will be the same as the index it gets on allVarNames
 * @param {$nordom} domain
 * @returns {number} varIndex
 */
function _config_addVar(config, varName, domain, _allowEmpty, _override = false) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(_allowEmpty || domain, 'NON_EMPTY_DOMAIN');
  ASSERT(_allowEmpty || domain_min(domain) >= SUB, 'domain lo should be >= SUB', domain);
  ASSERT(_allowEmpty || domain_max(domain) <= SUP, 'domain hi should be <= SUP', domain);

  if (_override) {
    ASSERT(trie_has(config._varNamesTrie, varName), 'Assuming var exists when explicitly overriding');
    let index = trie_get(config._varNamesTrie, varName);
    ASSERT(index >= 0, 'should exist');
    ASSERT_NORDOM(domain, true, domain__debug);
    config.initialDomains[index] = domain;
    return;
  }

  let allVarNames = config.allVarNames;
  let varIndex = allVarNames.length;

  if (varName === true) {
    varName = '__' + String(varIndex) + '__';
  } else {
    if (typeof varName !== 'string') THROW('Var names should be a string or anonymous, was: ' + JSON.stringify(varName));
    if (!varName) THROW('Var name cannot be empty string');
    if (String(parseInt(varName, 10)) === varName) THROW('Don\'t use numbers as var names (' + varName + ')');
  }

  // note: 100 is an arbitrary number but since large sets are probably
  // automated it's very unlikely we'll need this check in those cases
  if (varIndex < 100) {
    if (trie_has(config._varNamesTrie, varName)) THROW('Var name already part of this config. Probably a bug?', varName);
  }

  let solvedTo = domain_getValue(domain);
  if (solvedTo !== NOT_FOUND && !config.constantCache[solvedTo]) config.constantCache[solvedTo] = varIndex;

  ASSERT_NORDOM(domain, true, domain__debug);
  config.initialDomains[varIndex] = domain;
  config.allVarNames.push(varName);
  trie_add(config._varNamesTrie, varName, varIndex);

  return varIndex;
}

/**
 * Initialize the config of this space according to certain presets
 *
 * @param {$config} config
 * @param {string} varName
 */
function config_setDefaults(config, varName) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  let defs = distribution_getDefaults(varName);
  for (let key in defs) config_setOption(config, key, defs[key]);
}

/**
 * Create a config object for the var distribution
 *
 * @param {Object} obj
 * @property {string} [obj.type] Map to the internal names for var distribution strategies
 * @property {string} [obj.priorityList] An ordered list of var names to prioritize. Names not in the list go implicitly and unordered last.
 * @property {boolean} [obj.inverted] Should the list be interpreted inverted? Unmentioned names still go last, regardless.
 * @property {Object} [obj.fallback] Same struct as obj. If current strategy is inconclusive it can fallback to another strategy.
 * @returns {$var_strat_config}
 */
function config_createVarStratConfig(obj) {
  /**
   * @typedef {$var_strat_config}
   */
  return {
    _class: '$var_strat_config',
    type: (obj && obj.type) || 'naive',
    priorityByName: obj && obj.priorityList,
    _priorityByIndex: undefined,
    inverted: !!(obj && obj.inverted),
    fallback: obj && obj.fallback,
  };
}

/**
 * Configure an option for the solver
 *
 * @param {$config} config
 * @param {string} optionName
 * @param {*} optionValue
 * @param {string} [optionTarget] For certain options, this is the target var name
 */
function config_setOption(config, optionName, optionValue, optionTarget) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof optionName === 'string', 'option name is a string');
  ASSERT(optionValue !== undefined, 'should get a value');
  ASSERT(optionTarget === undefined || typeof optionTarget === 'string', 'the optional name is a string');

  if (optionName === 'varStratOverride') {
    THROW('deprecated, should be wiped internally');
  }

  switch (optionName) {
    case 'varStrategy':
      if (typeof optionValue === 'function') THROW('functions no longer supported', optionValue);
      if (typeof optionValue === 'string') THROW('strings should be passed on as {type:value}', optionValue);
      if (typeof optionValue !== 'object') THROW('varStrategy should be object', optionValue);
      if (optionValue.name) THROW('name should be type');
      if (optionValue.dist_name) THROW('dist_name should be type');

      let vsc = config_createVarStratConfig(optionValue);
      config.varStratConfig = vsc;
      while (vsc.fallback) {
        vsc.fallback = config_createVarStratConfig(vsc.fallback);
        vsc = vsc.fallback;
      }
      break;

    case 'valueStrategy':
      // determine how the next value of a variable is picked when creating a new space
      config.valueStratName = optionValue;
      break;

    case 'targeted_var_names':
      if (!optionValue || !optionValue.length) THROW('ONLY_USE_WITH_SOME_TARGET_VARS'); // omit otherwise to target all
      // which vars must be solved for this space to be solved
      // string: 'all'
      // string[]: list of vars that must be solved
      // function: callback to return list of names to be solved
      config.targetedVars = optionValue;
      break;

    case 'varStratOverrides':
      // An object which defines a value distributor per variable
      // which overrides the globally set value distributor.
      // See Bvar#distributeOptions (in multiverse)

      for (let key in optionValue) {
        config_setOption(config, 'varValueStrat', optionValue[key], key);
      }
      break;

    case 'varValueStrat':
      // override all the specific strategy parameters for one variable
      ASSERT(typeof optionTarget === 'string', 'expecting a name');
      if (!config.varDistOptions) config.varDistOptions = {};
      ASSERT(!config.varDistOptions[optionTarget], 'should not be known yet');
      config.varDistOptions[optionTarget] = optionValue;

      if (optionValue.valtype === 'markov') {
        let matrix = optionValue.matrix;
        if (!matrix) {
          if (optionValue.expandVectorsWith) {
            matrix = optionValue.matrix = [{vector: []}];
          } else {
            THROW('Solver: markov var missing distribution (needs matrix or expandVectorsWith)');
          }
        }

        for (let i = 0, n = matrix.length; i < n; ++i) {
          let row = matrix[i];
          if (row.boolean) THROW('row.boolean was deprecated in favor of row.boolVarName');
          if (row.booleanId !== undefined) THROW('row.booleanId is no longer used, please use row.boolVarName');
          let boolFuncOrName = row.boolVarName;
          if (typeof boolFuncOrName === 'function') {
            boolFuncOrName = boolFuncOrName(optionValue);
          }
          if (boolFuncOrName) {
            if (typeof boolFuncOrName !== 'string') {
              THROW('row.boolVarName, if it exists, should be the name of a var or a func that returns that name, was/got: ' + boolFuncOrName + ' (' + typeof boolFuncOrName + ')');
            }
            // store the var index
            row._boolVarIndex = trie_get(config._varNamesTrie, boolFuncOrName);
          }
        }
      }

      break;

    case 'timeoutCallback':
      // A function that returns true if the current search should stop
      // Can be called multiple times after the search is stopped, should
      // keep returning false (or assume an uncertain outcome).
      // The function is called after the first batch of propagators is
      // called so it won't immediately stop. But it stops quickly.
      config.timeoutCallback = optionValue;
      break;

    case 'var': return THROW('REMOVED. Replace `var` with `varStrategy`');
    case 'val': return THROW('REMOVED. Replace `var` with `valueStrategy`');

    case 'rng':
      // sets the default rng for this solve. a string should be raw js
      // code, number will be a static return value, a function is used
      // as is. the resulting function should return a value `0<=v<1`
      if (typeof optionValue === 'string') {
        config.rngCode = optionValue;
      } else if (typeof optionValue === 'number') {
        config.rngCode = 'return ' + optionValue + ';'; // dont use arrow function. i dont think this passes through babel.
      } else {
        ASSERT(typeof optionValue === 'function', 'rng should be a preferably a string and otherwise a function');
        config._defaultRng = optionValue;
      }
      break;

    default: THROW('unknown option');
  }
}

/**
 * This function should be removed once we can update mv
 *
 * @deprecated in favor of config_setOption
 * @param {$config} config
 * @param {Object} options
 * @property {Object} [options.varStrategy]
 * @property {string} [options.varStrategy.name]
 * @property {string[]} [options.varStrategy.list] Only if name=list
 * @property {string[]} [options.varStrategy.priorityList] Only if name=list
 * @property {boolean} [options.varStrategy.inverted] Only if name=list
 * @property {Object} [options.varStrategy.fallback] Same struct as options.varStrategy (recursive)
 */
function config_setOptions(config, options) {
  if (!options) return;

  if (options.varStrategy) config_setOption(config, 'varStrategy', options.varStrategy);
  if (options.valueStrategy) config_setOption(config, 'valueStrategy', options.valueStrategy);
  if (options.targeted_var_names) config_setOption(config, 'targeted_var_names', options.targeted_var_names);
  if (options.varStratOverrides) config_setOption(config, 'varStratOverrides', options.varStratOverrides);
  if (options.varStratOverride) {
    console.warn('deprecated "varStratOverride" in favor of "varValueStrat"');
    config_setOption(config, 'varValueStrat', options.varStratOverride, options.varStratOverrideName);
  }
  if (options.varValueStrat) config_setOption(config, 'varValueStrat', options.varValueStrat, options.varStratOverrideName);
  if (options.timeoutCallback) config_setOption(config, 'timeoutCallback', options.timeoutCallback);
}

/**
 * @param {$config} config
 * @param {$propagator} propagator
 */
function config_addPropagator(config, propagator) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(propagator._class === '$propagator', 'EXPECTING_PROPAGATOR');
  config._propagators.push(propagator);
}

/**
 * Creates a mapping from a varIndex to a set of propagatorIndexes
 * These propagators are the ones that use the varIndex
 * This is useful for quickly determining which propagators
 * need to be stepped while propagating them.
 *
 * @param {$config} config
 */
function config_populateVarPropHash(config) {
  let hash = new Array(config.allVarNames.length);
  let propagators = config._propagators;
  let initialDomains = config.initialDomains;
  for (let propagatorIndex = 0, plen = propagators.length; propagatorIndex < plen; ++propagatorIndex) {
    let propagator = propagators[propagatorIndex];
    _config_addVarConditionally(propagator.index1, initialDomains, hash, propagatorIndex);
    if (propagator.index2 >= 0) _config_addVarConditionally(propagator.index2, initialDomains, hash, propagatorIndex);
    if (propagator.index3 >= 0) _config_addVarConditionally(propagator.index3, initialDomains, hash, propagatorIndex);
  }
  config._varToPropagators = hash;
}
function _config_addVarConditionally(varIndex, initialDomains, hash, propagatorIndex) {
  // (at some point this could be a strings, or array, or whatever)
  ASSERT(typeof varIndex === 'number', 'must be number');
  // dont bother adding props on unsolved vars because they can't affect
  // anything anymore. seems to prevent about 10% in our case so worth it.
  let domain = initialDomains[varIndex];
  ASSERT_NORDOM(domain, true, domain__debug);
  if (!domain_isSolved(domain)) {
    if (!hash[varIndex]) hash[varIndex] = [propagatorIndex];
    else if (hash[varIndex].indexOf(propagatorIndex) < 0) hash[varIndex].push(propagatorIndex);
  }
}

/**
 * Create a constraint. If the constraint has a result var it
 * will return (only) the variable name that ends up being
 * used (anonymous or not).
 *
 * In some edge cases the constraint can be resolved immediately.
 * There are two ways a constraint can resolve: solved or reject.
 * A solved constraint is omitted and if there is a result var it
 * will become a constant that is set to the outcome of the
 * constraint. If rejected the constraint will still be added and
 * will immediately reject the search once it starts.
 *
 * Due to constant optimization and mapping the result var name
 * may differ from the input var name. In that case both names
 * should map to the same var index internally. Only constraints
 * with a result var have a return value here.
 *
 * @param {$config} config
 * @param {string} name Type of constraint (hardcoded values)
 * @param {<string,number,undefined>[]} varNames All the argument var names for target constraint
 * @param {string} [param] The result var name for certain. With reifiers param is the actual constraint to reflect.
 * @returns {string|undefined} Actual result vars only, undefined otherwise. See desc above.
 */
function config_addConstraint(config, name, varNames, param) {
  // should return a new var name for most props
  ASSERT(config && config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(varNames.every(e => typeof e === 'string' || typeof e === 'number' || e === undefined), 'all var names should be strings or numbers or undefined', varNames);

  let inputConstraintKeyOp = name;
  let resultVarName;

  let anonIsBool = false;
  switch (name) { /* eslint no-fallthrough: "off" */
    case 'reifier':
      anonIsBool = true;
      inputConstraintKeyOp = param;
      // fall-through
    case 'plus':
    case 'min':
    case 'ring-mul':
    case 'ring-div':
    case 'mul':
      ASSERT(varNames.length === 3, 'MISSING_RESULT_VAR'); // note that the third value may still be "undefined"
      // fall-through
    case 'sum':
    case 'product': {
      let sumOrProduct = name === 'product' || name === 'sum';

      resultVarName = sumOrProduct ? param : varNames[2];
      let resultVarIndex;

      if (resultVarName === undefined) {
        if (anonIsBool) resultVarIndex = config_addVarAnonRange(config, 0, 1);
        else resultVarIndex = config_addVarAnonNothing(config);
        resultVarName = config.allVarNames[resultVarIndex];
      } else if (typeof resultVarName === 'number') {
        resultVarIndex = config_addVarAnonConstant(config, resultVarName);
        resultVarName = config.allVarNames[resultVarIndex];
      } else if (typeof resultVarName !== 'string') {
        THROW(`expecting result var name to be absent or a number or string: \`${resultVarName}\``);
      } else {
        resultVarIndex = trie_get(config._varNamesTrie, resultVarName);
        if (resultVarIndex < 0) THROW('Vars must be defined before using them (' + resultVarName + ')');
      }

      if (sumOrProduct) param = resultVarIndex;
      else varNames[2] = resultVarName;

      break;
    }

    case 'distinct':
    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      break;

    default:
      THROW(`UNKNOWN_PROPAGATOR ${name}`);
  }

  // note: if param is a var constant then that case is already resolved above
  config_compileConstants(config, varNames);

  if (config_dedupeConstraint(config, inputConstraintKeyOp + '|' + varNames.join(','), resultVarName)) return resultVarName;

  let varIndexes = config_varNamesToIndexes(config, varNames);

  if (!config_solvedAtCompileTime(config, name, varIndexes, param)) {
    let constraint = constraint_create(name, varIndexes, param);
    config.allConstraints.push(constraint);
  }

  return resultVarName;
}

/**
 * Go through the list of var names and create an anonymous var for
 * each value that is actually a number rather than a string.
 * Replaces the values inline.
 *
 * @param {$config} config
 * @param {string|number} varNames
 */
function config_compileConstants(config, varNames) {
  for (let i = 0, n = varNames.length; i < n; ++i) {
    if (typeof varNames[i] === 'number') {
      let varIndex = config_addVarAnonConstant(config, varNames[i]);
      varNames[i] = config.allVarNames[varIndex];
    }
  }
}

/**
 * Convert a list of var names to a list of their indexes
 *
 * @param {$config} config
 * @param {string[]} varNames
 * @returns {number[]}
 */
function config_varNamesToIndexes(config, varNames) {
  let varIndexes = [];
  for (let i = 0, n = varNames.length; i < n; ++i) {
    let varName = varNames[i];
    ASSERT(typeof varName === 'string', 'var names should be strings here', varName, i, varNames);
    let varIndex = trie_get(config._varNamesTrie, varName);
    ASSERT(varIndex !== TRIE_KEY_NOT_FOUND, 'CONSTRAINT_VARS_SHOULD_BE_DECLARED', 'name=', varName, 'index=', i, 'names=', varNames);
    varIndexes[i] = varIndex;
  }
  return varIndexes;
}

/**
 * Check whether we already know a given constraint (represented by a unique string).
 * If we don't, add the string to the cache with the expected result name, if any.
 *
 * @param config
 * @param constraintUI
 * @param resultVarName
 * @returns {boolean}
 */
function config_dedupeConstraint(config, constraintUI, resultVarName) {
  if (!config._constraintHash) config._constraintHash = {}; // can happen for imported configs that are extended or smt
  let haveConstraint = config._constraintHash[constraintUI];
  if (haveConstraint === true) {
    if (resultVarName !== undefined) {
      throw new Error('How is this possible?'); // either a constraint-with-value gets a result var, or it's a constraint-sans-value
    }
    return true;
  }
  if (haveConstraint !== undefined) {
    ASSERT(typeof haveConstraint === 'string', 'if not true or undefined, it should be a string');
    ASSERT(resultVarName && typeof resultVarName === 'string', 'if it was recorded as a constraint-with-value then it should have a result var now as well');
    // the constraint exists and had a result. map that result to this result for equivalent results.
    config_addConstraint(config, 'eq', [resultVarName, haveConstraint]); // _could_ also be optimized away ;)
    return true;
  }
  config._constraintHash[constraintUI] = resultVarName || true;
  return false;
}

/**
 * If either side of certain constraints are solved at compile time, which
 * is right now, then the constraint should not be recorded at all because
 * it will never "unsolve". This can cause vars to become rejected before
 * the search even begins and that is okay.
 *
 * @param {$config} config
 * @param {string} constraintName
 * @param {number[]} varIndexes
 * @param {*} [param] The extra parameter for constraints
 * @returns {boolean}
 */
function config_solvedAtCompileTime(config, constraintName, varIndexes, param) {
  if (constraintName === 'lte' || constraintName === 'lt') {
    return _config_solvedAtCompileTimeLtLte(config, constraintName, varIndexes);
  } else if (constraintName === 'gte' || constraintName === 'gt') {
    return _config_solvedAtCompileTimeGtGte(config, constraintName, varIndexes);
  } else if (constraintName === 'eq') {
    return _config_solvedAtCompileTimeEq(config, constraintName, varIndexes);
  } else if (constraintName === 'neq') {
    return _config_solvedAtCompileTimeNeq(config, constraintName, varIndexes);
  } else if (constraintName === 'reifier') {
    return _config_solvedAtCompileTimeReifier(config, constraintName, varIndexes, param);
  } else if (constraintName === 'sum') {
    return _config_solvedAtCompileTimeSumProduct(config, constraintName, varIndexes, param);
  } else if (constraintName === 'product') {
    return _config_solvedAtCompileTimeSumProduct(config, constraintName, varIndexes, param);
  }
  return false;
}
function _config_solvedAtCompileTimeLtLte(config, constraintName, varIndexes) {
  let initialDomains = config.initialDomains;
  let varIndexLeft = varIndexes[0];
  let varIndexRight = varIndexes[1];

  let domainLeft = initialDomains[varIndexLeft];
  let domainRight = initialDomains[varIndexRight];

  ASSERT_NORDOM(domainLeft, true, domain__debug);
  ASSERT_NORDOM(domainRight, true, domain__debug);
  ASSERT(domainLeft && domainRight, 'NON_EMPTY_DOMAINS_EXPECTED'); // empty domains should be caught by addvar/decl

  let v = domain_getValue(domainLeft);
  if (v !== NO_SUCH_VALUE) {
    let targetValue = v - (constraintName === 'lt' ? 0 : 1);
    initialDomains[varIndexRight] = domain_removeLte(domainRight, targetValue);
    // do not add constraint; this constraint is already solved
    config._constrainedAway.push(varIndexLeft, varIndexRight);
    return true;
  }

  v = domain_getValue(domainRight);
  if (v !== NO_SUCH_VALUE) {
    let targetValue = v + (constraintName === 'lt' ? 0 : 1);
    initialDomains[varIndexLeft] = domain_removeGte(domainLeft, targetValue);
    // do not add constraint; this constraint is already solved
    config._constrainedAway.push(varIndexLeft, varIndexRight);
    return true;
  }

  ASSERT(domainLeft, 'left should not be empty');
  ASSERT(domainRight, 'right should not be empty');

  let targetGte = domain_max(domainRight) + (constraintName === 'lt' ? 0 : 1);
  let newLeft = initialDomains[varIndexLeft] = domain_removeGte(domainLeft, targetGte);
  let targetLte = domain_min(domainLeft) - (constraintName === 'lt' ? 0 : 1);
  let newRight = initialDomains[varIndexRight] = domain_removeLte(domainRight, targetLte);

  if (domainLeft !== newLeft || domainRight !== newRight) return _config_solvedAtCompileTimeLtLte(config, constraintName, varIndexes);

  return false;
}
function _config_solvedAtCompileTimeGtGte(config, constraintName, varIndexes) {
  let initialDomains = config.initialDomains;
  let varIndexLeft = varIndexes[0];
  let varIndexRight = varIndexes[1];

  let domainLeft = initialDomains[varIndexLeft];
  let domainRight = initialDomains[varIndexRight];

  ASSERT_NORDOM(domainLeft, true, domain__debug);
  ASSERT_NORDOM(domainRight, true, domain__debug);
  ASSERT(domainLeft && domainRight, 'NON_EMPTY_DOMAINS_EXPECTED'); // empty domains should be caught by addvar/decl

  let v = domain_getValue(domainLeft);
  if (v !== NO_SUCH_VALUE) {
    let targetValue = v + (constraintName === 'gt' ? 0 : 1);
    initialDomains[varIndexRight] = domain_removeGte(domainRight, targetValue, true);
    // do not add constraint; this constraint is already solved
    config._constrainedAway.push(varIndexLeft, varIndexRight);
    return true;
  }

  v = domain_getValue(domainRight);
  if (v !== NO_SUCH_VALUE) {
    let targetValue = v - (constraintName === 'gt' ? 0 : 1);
    initialDomains[varIndexLeft] = domain_removeLte(domainLeft, targetValue);
    // do not add constraint; this constraint is already solved
    config._constrainedAway.push(varIndexLeft, varIndexRight);
    return true;
  }

  // A > B or A >= B. smallest number in A must be larger than the smallest number in B. largest number in B must be smaller than smallest number in A
  let targetLte = domain_min(domainRight) - (constraintName === 'gt' ? 0 : 1);
  let newLeft = initialDomains[varIndexLeft] = domain_removeLte(domainLeft, targetLte);
  let targetGte = domain_max(domainLeft) + (constraintName === 'gt' ? 0 : 1);
  let newRight = initialDomains[varIndexRight] = domain_removeGte(domainRight, targetGte);

  // if the domains changed there's a chance this propagator is now removable
  if (domainLeft !== newLeft || domainRight !== newRight) return _config_solvedAtCompileTimeGtGte(config, constraintName, varIndexes);

  return false;
}
function _config_solvedAtCompileTimeEq(config, constraintName, varIndexes) {
  let initialDomains = config.initialDomains;
  let varIndexLeft = varIndexes[0];
  let varIndexRight = varIndexes[1];
  let a = initialDomains[varIndexLeft];
  let b = initialDomains[varIndexRight];
  let v = domain_getValue(a);
  if (v === NO_SUCH_VALUE) v = domain_getValue(b);
  if (v !== NO_SUCH_VALUE) {
    let r = domain_intersection(a, b);
    initialDomains[varIndexLeft] = r;
    initialDomains[varIndexRight] = r;
    config._constrainedAway.push(varIndexLeft, varIndexRight);
    return true;
  }
  return false;
}
function _config_solvedAtCompileTimeNeq(config, constraintName, varIndexes) {
  let initialDomains = config.initialDomains;
  let varIndexLeft = varIndexes[0];
  let varIndexRight = varIndexes[1];
  let v = domain_getValue(initialDomains[varIndexLeft]);
  if (v !== NO_SUCH_VALUE) {
    initialDomains[varIndexRight] = domain_removeValue(initialDomains[varIndexRight], v);
    config._constrainedAway.push(varIndexLeft, varIndexRight);
    return true;
  }
  v = domain_getValue(initialDomains[varIndexRight]);
  if (v !== NO_SUCH_VALUE) {
    initialDomains[varIndexLeft] = domain_removeValue(initialDomains[varIndexLeft], v);
    config._constrainedAway.push(varIndexLeft, varIndexRight);
    return true;
  }
  return false;
}
function _config_solvedAtCompileTimeReifier(config, constraintName, varIndexes, opName) {
  let initialDomains = config.initialDomains;
  let varIndexLeft = varIndexes[0];
  let varIndexRight = varIndexes[1];
  let varIndexResult = varIndexes[2];

  let domain1 = initialDomains[varIndexLeft];
  let domain2 = initialDomains[varIndexRight];
  let domain3 = initialDomains[varIndexResult];

  ASSERT_NORDOM(domain1, true, domain__debug);
  ASSERT_NORDOM(domain2, true, domain__debug);
  ASSERT_NORDOM(domain3, true, domain__debug);

  let v1 = domain_getValue(initialDomains[varIndexLeft]);
  let v2 = domain_getValue(initialDomains[varIndexRight]);
  let hasLeft = v1 !== NO_SUCH_VALUE;
  let hasRight = v2 !== NO_SUCH_VALUE;
  if (hasLeft && hasRight) { // just left or right would not force anything. but both does.
    return _config_solvedAtCompileTimeReifierBoth(config, varIndexes, opName, v1, v2);
  }

  let resultIsFalsy = domain_isZero(domain3);
  let resultIsTruthy = domain_hasNoZero(domain3);
  if (resultIsFalsy !== resultIsTruthy) { // if it has either no zero or is zero then C is solved
    if (hasLeft) {
      // resolve right and eliminate reifier
      return _config_solvedAtCompileTimeReifierLeft(config, opName, varIndexRight, v1, resultIsTruthy, domain1, domain2);
    } else if (hasRight) {
      // resolve right and eliminate reifier
      return _config_solvedAtCompileTimeReifierRight(config, opName, varIndexLeft, v2, resultIsTruthy, domain1, domain2);
    }
  }

  if (opName !== 'eq' && opName !== 'neq') {
    // must be lt lte gt gte. these are solved completely when either param is solved
    ASSERT(opName === 'lt' || opName === 'lte' || opName === 'gt' || opName === 'gte', 'should be lt lte gt gte now because there are no other reifiers atm');

    const PASSED = true;
    const FAILED = false;

    if (opName === 'lt') {
      // A < B. solved if max(A) < min(B). rejected if min(A) >= max(B)
      if (domain_max(domain1) < domain_min(domain2)) return _config_eliminateReifier(config, varIndexLeft, varIndexRight, varIndexResult, domain3, PASSED);
      if (domain_min(domain1) >= domain_max(domain2)) return _config_eliminateReifier(config, varIndexLeft, varIndexRight, varIndexResult, domain3, FAILED);
    } else if (opName === 'lte') {
      // A <= B. solved if max(A) <= min(B). rejected if min(A) > max(B)
      if (domain_max(domain1) <= domain_min(domain2)) return _config_eliminateReifier(config, varIndexLeft, varIndexRight, varIndexResult, domain3, PASSED);
      if (domain_min(domain1) > domain_max(domain2)) return _config_eliminateReifier(config, varIndexLeft, varIndexRight, varIndexResult, domain3, FAILED);
    } else if (opName === 'gt') {
      // A > B. solved if min(A) > max(B). rejected if max(A) <= min(B)
      if (domain_min(domain1) > domain_max(domain2)) return _config_eliminateReifier(config, varIndexLeft, varIndexRight, varIndexResult, domain3, PASSED);
      if (domain_max(domain1) <= domain_min(domain2)) return _config_eliminateReifier(config, varIndexLeft, varIndexRight, varIndexResult, domain3, FAILED);
    } else if (opName === 'gte') {
      // A > B. solved if min(A) >= max(B). rejected if max(A) < min(B)
      if (domain_min(domain1) >= domain_max(domain2)) return _config_eliminateReifier(config, varIndexLeft, varIndexRight, varIndexResult, domain3, PASSED);
      if (domain_max(domain1) < domain_min(domain2)) return _config_eliminateReifier(config, varIndexLeft, varIndexRight, varIndexResult, domain3, FAILED);
    } else {
      THROW('UNKNOWN_OP');
    }
  }

  return false;
}
function _config_eliminateReifier(config, leftVarIndex, rightVarIndex, resultVarIndex, resultDomain, result) {
  config.initialDomains[resultVarIndex] = domain_resolveAsBooly(resultDomain, result);
  config._constrainedAway.push(leftVarIndex, rightVarIndex, resultVarIndex);
  return true;
}
function _config_solvedAtCompileTimeReifierBoth(config, varIndexes, opName, v1, v2) {
  let initialDomains = config.initialDomains;
  let varIndexResult = varIndexes[2];

  let bool = false;
  switch (opName) {
    case 'lt':
      bool = v1 < v2;
      break;
    case 'lte':
      bool = v1 <= v2;
      break;
    case 'gt':
      bool = v1 > v2;
      break;
    case 'gte':
      bool = v1 >= v2;
      break;
    case 'eq':
      bool = v1 === v2;
      break;
    case 'neq':
      bool = v1 !== v2;
      break;
    default:
      return false;
  }

  initialDomains[varIndexResult] = domain_resolveAsBooly(initialDomains[varIndexResult], bool);
  config._constrainedAway.push(varIndexResult); // note: left and right have been solved already so no need to push those here
  return true;
}
function _config_solvedAtCompileTimeReifierLeft(config, opName, varIndex, value, result, domain1, domain2) {
  let initialDomains = config.initialDomains;

  let domain = initialDomains[varIndex];
  switch (opName) {
    case 'lt':
      if (result) domain = domain_removeLte(domain, value);
      else domain = domain_removeGte(domain, value + 1);
      break;
    case 'lte':
      if (result) domain = domain_removeLte(domain, value - 1);
      else domain = domain_removeGte(domain, value);
      break;
    case 'gt':
      if (result) domain = domain_removeGte(domain, value);
      else domain = domain_removeLte(domain, value - 1);
      break;
    case 'gte':
      if (result) domain = domain_removeGte(domain, value + 1);
      else domain = domain_removeLte(domain, value);
      break;
    case 'eq':
      if (result) domain = domain_intersection(domain1, domain2);
      else domain = domain_removeValue(domain, value);
      break;
    case 'neq':
      if (result) domain = domain_removeValue(domain, value);
      else domain = domain_intersection(domain1, domain2);
      break;
    default:
      return false;
  }

  ASSERT_NORDOM(domain, true, domain__debug);
  initialDomains[varIndex] = domain;
  config._constrainedAway.push(varIndex); // note: left and result have been solved already so no need to push those here
  return true;
}
function _config_solvedAtCompileTimeReifierRight(config, opName, varIndex, value, result, domain1, domain2) {
  let initialDomains = config.initialDomains;

  let domain = initialDomains[varIndex];
  switch (opName) {
    case 'lt':
      if (result) domain = domain_removeGte(domain, value);
      else domain = domain_removeLte(domain, value - 1);
      break;
    case 'lte':
      if (result) domain = domain_removeGte(domain, value + 1);
      else domain = domain_removeLte(domain, value);
      break;
    case 'gt':
      if (result) domain = domain_removeLte(domain, value);
      else domain = domain_removeGte(domain, value + 1);
      break;
    case 'gte':
      if (result) domain = domain_removeLte(domain, value - 1);
      else domain = domain_removeGte(domain, value);
      break;
    case 'eq':
      if (result) domain = domain_intersection(domain1, domain2);
      else domain = domain_removeValue(domain, value);
      break;
    case 'neq':
      if (result) domain = domain_removeValue(domain, value);
      else domain = domain_intersection(domain1, domain2);
      break;
    default:
      return false;
  }

  ASSERT_NORDOM(domain, true, domain__debug);
  initialDomains[varIndex] = domain;
  config._constrainedAway.push(varIndex); // note: right and result have been solved already so no need to push those here
  return true;
}
function _config_solvedAtCompileTimeSumProduct(config, constraintName, varIndexes, resultIndex) {
  ASSERT(constraintName === 'sum' || constraintName === 'product', 'if this changes update the function accordingly');
  let initialDomains = config.initialDomains;

  // for product, multiply by 1 to get identity. for sum it's add 0 for identity.
  const SUM_IDENT = 0;
  const PROD_IDENT = 1;
  const IDENT = constraintName === 'product' ? PROD_IDENT : SUM_IDENT;

  // if there are no vars then the next step would fail. could happen as an artifact.
  if (initialDomains.length && varIndexes.length) {
    // limit result var to the min/max possible sum
    let maxDomain = initialDomains[varIndexes[0]]; // dont start with EMPTY or [0,0]!
    for (let i = 1, n = varIndexes.length; i < n; ++i) {
      let varIndex = varIndexes[i];
      let domain = initialDomains[varIndex];
      if (constraintName === 'sum') maxDomain = domain_plus(maxDomain, domain);
      else maxDomain = domain_mul(maxDomain, domain);
    }
    initialDomains[resultIndex] = domain_intersection(maxDomain, initialDomains[resultIndex]);
  }

  // eliminate multiple constants
  if (varIndexes.length > 1) {
    let newVarIndexes = [];
    let total = IDENT;
    for (let i = 0, n = varIndexes.length; i < n; ++i) {
      let varIndex = varIndexes[i];
      let domain = initialDomains[varIndex];
      let value = domain_getValue(domain);
      if (value === NO_SUCH_VALUE) {
        newVarIndexes.push(varIndex);
      } else if (constraintName === 'sum') {
        total += value;
      } else if (constraintName === 'product') {
        total *= value;
      }
    }

    // we cant just remove constants from the result like a math equation; different paradigms
    // if there are no vars left then the result must equal the constant (put it back in the list, even if identity)
    if (!newVarIndexes.length || (constraintName === 'sum' && total !== SUM_IDENT) || (constraintName === 'product' && total !== PROD_IDENT)) {
      let varIndex = config_addVarAnonConstant(config, total);
      newVarIndexes.push(varIndex);
    }

    // copy new list inline
    for (let i = 0, n = newVarIndexes.length; i < n; ++i) {
      varIndexes[i] = newVarIndexes[i];
    }
    varIndexes.length = newVarIndexes.length;
  }

  // shouldnt be zero here unless it was declared empty
  if (varIndexes.length === 0) {
    // TOFIX: should a product without args equal 1 or 0? currently we set it to 0 for both sum/product
    config.initialDomains[resultIndex] = domain_intersection(config.initialDomains[resultIndex], domain_createValue(0));
    return true;
  }

  if (varIndexes.length === 1) {
    // both in the case of sum and product, if there is only one value in the set, the result must be that value
    // so here we do an intersect that one value with the result because that's what must happen anyways
    let domain = domain_intersection(config.initialDomains[resultIndex], config.initialDomains[varIndexes[0]]);
    config.initialDomains[resultIndex] = domain;
    config.initialDomains[varIndexes[0]] = domain;
    if (domain_isSolved(domain)) {
      config._constrainedAway.push(varIndexes[0], resultIndex);
      return true;
    }
    // cant eliminate constraint; sum will compile an `eq` for it.
  }

  return false;
}

/**
 * Generate all propagators from the constraints in given config
 * Puts these back into the same config.
 *
 * @param {$config} config
 */
function config_generatePropagators(config) {
  ASSERT(config && config._class === '$config', 'EXPECTING_CONFIG');
  let constraints = config.allConstraints;
  config._propagators = [];
  for (let i = 0, n = constraints.length; i < n; ++i) {
    let constraint = constraints[i];
    if (constraint.varNames) {
      console.warn('saw constraint.varNames, converting to varIndexes, log out result and update test accordingly');
      constraint.varIndexes = constraint.varNames.map(name => trie_get(config._varNamesTrie, name));
      let p = constraint.param;
      delete constraint.param;
      delete constraint.varNames;
      constraint.param = p;
    }
    config_generatePropagator(config, constraint.name, constraint.varIndexes, constraint.param, constraint);
  }
}
/**
 * @param {$config} config
 * @param {string} name
 * @param {number[]} varIndexes
 * @param {string|undefined} param Depends on the prop; reifier=op name, product/sum=result var
 */
function config_generatePropagator(config, name, varIndexes, param, _constraint) {
  ASSERT(config && config._class === '$config', 'EXPECTING_CONFIG');
  ASSERT(typeof name === 'string', 'NAME_SHOULD_BE_STRING');
  ASSERT(varIndexes instanceof Array, 'INDEXES_SHOULD_BE_ARRAY', JSON.stringify(_constraint));

  switch (name) {
    case 'plus':
      return propagator_addPlus(config, varIndexes[0], varIndexes[1], varIndexes[2]);

    case 'min':
      return propagator_addMin(config, varIndexes[0], varIndexes[1], varIndexes[2]);

    case 'ring-mul':
      return propagator_addRingMul(config, varIndexes[0], varIndexes[1], varIndexes[2]);

    case 'ring-div':
      return propagator_addDiv(config, varIndexes[0], varIndexes[1], varIndexes[2]);

    case 'mul':
      return propagator_addMul(config, varIndexes[0], varIndexes[1], varIndexes[2]);

    case 'sum':
      return propagator_addSum(config, varIndexes.slice(0), param);

    case 'product':
      return propagator_addProduct(config, varIndexes.slice(0), param);

    case 'distinct':
      return propagator_addDistinct(config, varIndexes.slice(0));

    case 'reifier':
      return propagator_addReified(config, param, varIndexes[0], varIndexes[1], varIndexes[2]);

    case 'neq':
      return propagator_addNeq(config, varIndexes[0], varIndexes[1]);

    case 'eq':
      return propagator_addEq(config, varIndexes[0], varIndexes[1]);

    case 'gte':
      return propagator_addGte(config, varIndexes[0], varIndexes[1]);

    case 'lte':
      return propagator_addLte(config, varIndexes[0], varIndexes[1]);

    case 'gt':
      return propagator_addGt(config, varIndexes[0], varIndexes[1]);

    case 'lt':
      return propagator_addLt(config, varIndexes[0], varIndexes[1]);

    default:
      THROW('UNEXPECTED_NAME: ' + name);
  }
}

function config_generateMarkovs(config) {
  let varDistOptions = config.varDistOptions;
  for (let varName in varDistOptions) {
    let varIndex = trie_get(config._varNamesTrie, varName);
    if (varIndex < 0) THROW('Found markov var options for an unknown var name (' + varName + ')');
    let options = varDistOptions[varName];
    if (options && options.valtype === 'markov') {
      return propagator_addMarkov(config, varIndex);
    }
  }
}

function config_populateVarStrategyListHash(config) {
  let vsc = config.varStratConfig;
  while (vsc) {
    if (vsc.priorityByName) {
      let obj = {};
      let list = vsc.priorityByName;
      for (let i = 0, len = list.length; i < len; ++i) {
        let varIndex = trie_get(config._varNamesTrie, list[i]);
        ASSERT(varIndex !== TRIE_KEY_NOT_FOUND, 'VARS_IN_PRIO_LIST_SHOULD_BE_KNOWN_NOW');
        obj[varIndex] = len - i; // never 0, offset at 1. higher value is higher prio
      }
      vsc._priorityByIndex = obj;
    }

    vsc = vsc.fallback;
  }
}

/**
 * At the start of a search, populate this config with the dynamic data
 *
 * @param {$config} config
 */
function config_init(config) {
  ASSERT(config._class === '$config', 'EXPECTING_CONFIG');
  if (!config._varNamesTrie) {
    config._varNamesTrie = trie_create(config.allVarNames);
  }

  // Generate the default rng ("Random Number Generator") to use in stuff like markov
  // We prefer the rngCode because that way we can serialize the config (required for stuff like webworkers)
  if (!config._defaultRng) config._defaultRng = config.rngCode ? Function(config.rngCode) : Math.random; /* eslint no-new-func: "off" */

  ASSERT_VARDOMS_SLOW(config.initialDomains, domain__debug);
  config_generatePropagators(config);
  config_generateMarkovs(config);
  config_populateVarPropHash(config);
  config_populateVarStrategyListHash(config);
  ASSERT_VARDOMS_SLOW(config.initialDomains, domain__debug);

  ASSERT(config._varToPropagators, 'should have generated hash');
}

// BODY_STOP

export {
  config_addConstraint,
  config_addPropagator,
  config_addVarAnonConstant,
  config_addVarAnonNothing,
  config_addVarAnonRange,
  config_addVarConstant,
  config_addVarDomain,
  config_addVarNothing,
  config_addVarRange,
  config_clone,
  config_create,
  config_createVarStratConfig,
  config_generatePropagators,
  config_init,
  config_populateVarPropHash,
  config_setDefaults,
  config_setOption,
  config_setOptions,

  // testing
  _config_addVar,
};
