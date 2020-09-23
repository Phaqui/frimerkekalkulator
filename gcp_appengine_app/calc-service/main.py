from fastapi import FastAPI, Query

# for CORS
from starlette.middleware.cors import CORSMiddleware

from stamps import solutions_for_price as solve

app = FastAPI()

# for CORS
app.add_middleware(CORSMiddleware, allow_origins=['*'])

@app.get('/')
def index(
    price: int,
    stamps: str = Query(..., regex=r'^\d{1,3}(,\d{1,3})*$'),
):
    # convert from string "x,y,z" to list of ints [x, y, x]
    stamps = [int(s) for s in stamps.split(',')]

    combinations_seen = set()
    results = [(stmv, solv) for _, stmv, solv in solve(price, stamps)]

    return {'stamps': stamps,
            'price': price,
            'results': results}
