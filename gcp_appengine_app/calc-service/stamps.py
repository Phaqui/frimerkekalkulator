"""Snippet of 'stamps.py', modified to work with gcp app engine and FastAPI.

   Original code (c) Anders Lorentsen, 2017-09-14

   stamps.py: Tool to find how to stamp letters of different prices with
   a given set of stamps."""
import itertools
import json
import time
import operator
from collections import defaultdict
from functools import partial

def powerset(iterable, maxlen=None):
    """Generate all sets in the Powerset of iterable. Starts with the empty set,
    and works upwards in terms of cardinality.
    Pulled straight from the itertools docs."""
    maxlen = maxlen or len(iterable)
    s = tuple(iterable)
    CFI = itertools.chain.from_iterable
    C = itertools.combinations
    TW = itertools.takewhile

    full_powerset = TW(lambda x: len(x) <= maxlen, CFI(C(s, r) for r in range(len(s) + 1)))
    return itertools.islice(full_powerset, 1, None)

def factors(max_factors):
    """For a vector of factors, generate all possible vectors where the elements have all
    integer values from 1 to the limits set in the given `max_factors` argument.
    factors([2, 3]) -> (1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (2, 3)"""
    yield from itertools.product(*(range(1, i + 1) for i in max_factors))

def solutions_for_price(price, stamps, maxlen=None):
    """All possible ways of stamping a letter of price `price`, with stamps from the set `stamps`"""
    stamps = tuple(filter(lambda x: x <= price, stamps))
    for sub in powerset(stamps, maxlen=maxlen):
        max_factors = tuple(int(price / sub[i]) for i in range(len(sub)))
        yield from ((price, fac, sub) for fac in factors(max_factors) if price == sum(map(operator.mul, sub, fac)))

def all_solutions(prices, stamps, maxlen=None):
    """All possible ways of stamping letters of prices from `prices` with stamps from set `stamps`."""
    for price in prices:
        yield from solutions_for_price(price, stamps, maxlen=maxlen)
