from typing import List
from tempfile import NamedTemporaryFile
from fastapi import FastAPI
from pydantic import BaseModel
# to be able to directly respond with a pdf file
from starlette.responses import Response, FileResponse
# for CORS
from starlette.middleware.cors import CORSMiddleware
import jinja2
import weasyprint

template = None
app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'])


# every field is {price: XX, lines: ["5*10 + 1*15", "a*x + b*y + c*z"...]
class FieldModel(BaseModel):
    price: int
    lines: List[str]

# request body should be:  { prices: [field1, field2, ...] }
class RequestBody(BaseModel):
    prices: List[FieldModel]
    
@app.on_event('startup')
async def startup_event():
    # Load the template into the global variable (yeah..)
    global TEMPLATE
    loader = jinja2.FileSystemLoader('.')
    environ = jinja2.Environment(loader=loader)
    TEMPLATE = environ.get_template('template.html')

@app.post('/')
def index(request_body: RequestBody):
    rendered = str(TEMPLATE.render(data = request_body))
    pdf_data = weasyprint.HTML(string=rendered).write_pdf()
    return Response(content=pdf_data, media_type="application/pdf")


# looking at the template.html in firefox isn't exactly how the final pdf will
# look, so designing it takes a bit of time, as I have to regenerate the pdf
# for every change, but whatevs
# this is just like.. a copy of the entire file, more or less, heh
if __name__ == '__main__':
    with open('response.pdf', 'wb') as f:
        loader = jinja2.FileSystemLoader('.')
        environ = jinja2.Environment(loader=loader)
        TEMPLATE = environ.get_template('template.html')

        data = { 'prices': [
            { 'price': 55, 'lines': ['55 = 2x20 + 1*15', '55 = 11x5'] },
            { 'price': 90, 'lines': ['90 = 4x17 + 2x6 + 8x1', '90 = 5x3 + 15x1'] },
            ]}
        rendered = str(TEMPLATE.render(data = data))
        pdf_data = weasyprint.HTML(string=rendered).write_pdf()
        f.write(pdf_data)

