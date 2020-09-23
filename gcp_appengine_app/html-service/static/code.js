// Client-side js for "frimerkekalkulator"

let mainEl;
let current_page;
let small_screen;
let custom_stamps;
// Will be set when the db file finishes the async download, see below
let solutions_db = null;
let current_stamps_selected = [];
let current_prices_selected = [];


// When the db file finishes downloading, it will set a property on this
// proxy object, which we "trap" here, and update the solutions_db accordingly
let __proxy_obj = new Proxy({}, {
    set(target, prop, val) {
        solutions_db = val;

        hide_activity_icon();
        return true;
    }
});

//
// Various utility functions
const zip = (...rows) => [...rows[0]].map((_, c) => rows.map(row => row[c]))
const logical_xor = (a, b) => (a || b) && !(a && b);

// just for assertions, I'm not entirely sure that the method to find the index
// is always correct
//
// check that the array is strictly ascending
// note: naive, simple function so that I am convinced that it is correct
//   (*for now. tired when I'm writing this... :)
function array_is_rising(arr) {
    if (arr.length <= 1) return true;
    for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] >= arr[i+1]) {
            return false;
        }
    }

    return true;
}


function show_page(page = 'stamps') {
    let tmpl = document.querySelector(`template[data-pagename=${page}`);
    if (!tmpl) {
        console.debug(`show_page(): no page '${page}'`);
        return;
    }
    mainEl.innerHTML = '';
    let clone = document.importNode(tmpl.content, true);
    mainEl.append(clone);
    current_page = page;
    hide_menu();

    // change navigation button texts depending on the page we're on
    switch (current_page) {
        case 'stamps':
            if (current_stamps_selected.length == 0) {
                change_button_state('back_btn',
                    { add: ['deactivated'], text: 'Nullstill' });
                change_button_state('forward_btn', { add: ['deactivated'] });
            }
            if (small_screen) {
                change_button_state('forward_btn', { text: 'Neste...' });
            } else {
                let prices_tmpl = document.querySelector(
                    'template[data-pagename=prices]');
                let prices_el = document.importNode(prices_tmpl.content, true);
                mainEl.append(prices_el);

                // populate buttons for prices
                onPricesPageShown();
                change_button_state('forward_btn', { text: 'Finn kombinasjoner' });
            }
            onStampsPageShown();
            break;
        case 'prices':
            change_button_state('back_btn',
                { remove: ['deactivated'], text: 'Tilbake' });
            change_button_state('forward_btn',
                { add: ['deactivated'], text: 'Finn kombinasjoner' });
            onPricesPageShown();
            break;
        case 'results':
            onResultsPageShown();
            change_button_state('back_btn',
                { remove: ['deactivated'], text: 'Nytt søk' });
            change_button_state('forward_btn',
                { add: ['deactivated'], text: 'Lag pdf' });
            break;
        case 'pdfcreation':
            break;
    }

    //window.dispatchEvent(
    //    new CustomEvent('page_changed', { detail: { new_page: page }}));
}


function *powerset(arr) {
    // basically just loop through all ints  0..2^len(arr), and treat them
    // as bit patterns:
    // 001, 010, 011, 100, 101, 110, 111
    // then for each of these bit patterns, for each of the bits that are
    // set to 1, include that array element in that current result
    let num_subsets = Math.pow(2, arr.length);
    for (let i = 1; i < num_subsets; i++) {
        let next_result = [];
        for (let n = 0; n < arr.length; n++) {
            // if n'th bit of current bitstring is set, include the array
            // element with index n
            if (i & (1<<n)) next_result.push(parseInt(arr[n]));
        }
        yield next_result;
    }
}

// this function reads from the solutions_db, and emulates a response
// object for us, so we can directly use the results, instead of going
// to the API
// returns an object equal to that which the API would have given us if
// the combiation exists in the database, or false otherwise
function emulate_calcapi_response(price, stamps_url_str) {
    if (solutions_db === null) {
        console.debug('solutions_db not ready');
        return false;
    }
    // results looks like this:
    // [ [[c1, c2, ..], [s1, s2, ..]], [[a, b, c], [x, y, z]], [ [], [] ], .. ]
    // that is, one big array.
    // inside that array is one array per result, and that result
    // is divided into an array of combinations, then an array of stamps
    //
    // the solutions_db entry is:
    // solutions_db[price][stamps_url_str] = [ [c1, c2, c3], [x, y, z], ... ]
    // this means that I also have to get all the "substr" combiations, that is
    // if my stamps array consists of 4 numbers, I also need to retrieve every
    // subset of that from the solutions_db
    // the number of subsets of a set S is 2^m - 1,
    // where m is the number of elements in the set S.
    // m=4 => 15
    // m=8 => 255
    // m=12 => 4095
    // so, rising fairly rapidly, but we only have so and so many stamps
    // in our default set, so it should be fine... I guess.
    let results = [];
    let stamps = stamps_url_str.split(',');
    for (let subset of powerset(stamps)) {
        let stamps_str = subset.join(',');
        if (solutions_db[price] && solutions_db[price][stamps_str]) {
            // there can be multiple solutions of a given set of factors
            for (let sol_idx = 0;
                 sol_idx < solutions_db[price][stamps_str].length;
                 sol_idx++) {
                factors = solutions_db[price][stamps_str][sol_idx].slice(0);
                results.push([factors, subset]);
            }
        }
    }
    if (results.length > 0)
        return { stamps, price, results };
    return false;
}

// 
// DOM reading and manipulation functions

function get_selected(id, second_id) {
    let el = document.getElementById(id);
    if (!el) return [];
    let arr = Array.from(el.children);
    if (second_id) {
        let el2 = document.getElementById(second_id);
        if (el2) {
            arr.push(...Array.from(el2.children));
        }
    }
    return arr.filter(el => el.classList.contains('selected'));
}


// create the first <p> tag inside a result-area <section>, and all accompanying
// inner elements
function create_first_price_p(data) {
    const p = document.createElement('p');

    const id = data.price;
    const input = document.createElement('input');
    input.type = "checkbox";
    input.id = 'main_' + id;
    const label = document.createElement('label');
    label.addEventListener('click', main_price_label_click);
    label.htmlFor = 'main_' + id;

    p.append(input, label);
    let stamps = data.stamps.join(',');
    let price = data.price;
    
    if (data.results.length == 0) {
        label.textContent = `${price}: Ingen kombinasjoner av ${stamps} blir ${price})`;
        input.disabled = true;
    } else {
        label.textContent = `${price}:`;
        input.checked = true;
    }

    return p;
}

// displays an incoming api result inside the given (already created) DOM element
function display_result(dom_element, data) {
    let firstp;

    // empty out the initial <p>
    dom_element.innerHTML = '';

    // add the first <p>, which will be filled with correct text if the
    // results are empty
    firstp = create_first_price_p(data);
    dom_element.append(firstp);

    // finally, IF there are results, add each in their own <p> tag
    for (let [id, result] of data.results.entries()) {
        let pairs = zip(...result);
        const input = document.createElement('input');
        const label = document.createElement('label');
        const p = document.createElement('p');
        input.type = "checkbox";
        input.checked = true;
        input.id = 'resp_' + data.price + '_' + id;
        label.htmlFor = 'resp_' + data.price + '_' + id;

        label.textContent = data.price + ' = ' +
            pairs.map(([x, y]) => `${x}\u00D7${y}`).join(' + ');

        p.append(input, label);
        dom_element.append(p);
    }
}



function change_button_state(id, opts) {
    let el = document.getElementById(id);
    if (opts.hasOwnProperty('add')) {
        el.classList.add(...opts.add);
    }
    if (opts.hasOwnProperty('remove')) {
        el.classList.remove(...opts.remove);
    }
    if (opts.hasOwnProperty('text')) {
        el.textContent = opts.text;
    }
}

function show_activity_icon() {
    document.getElementById('activity-icon').classList.remove('hidden');
}

function hide_activity_icon() {
    document.getElementById('activity-icon').classList.add('hidden');
}

function show_toast(text, duration=4500, opts) {
    let toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), duration);
}










//
// DOM element creation functions
function new_number_box(text, user_added=false) {
    let newel = document.createElement('span');
    newel.classList.add('number-box');
    if (user_added) newel.classList.add('user-added');

    newel.innerText = text;
    newel.addEventListener('click', function(ev) {
        newel.classList.toggle('selected');

        // strange naming, but just to notify that any of the number buttons
        // has been clicked, to update the state of the control buttons
        number_button_clicked(ev);
    });
    return newel;
}


// XXX this function is named poorly. Insert new value? Into what?
function insert_new_value(container_el, value) {
    if (!value) return; // we want to ignore both 0 and undefined, so it's fine
    value_f = parseFloat(value);

    let first_larger_number_box = null;
    for (let number_box of container_el.children) {
        // just check by string for equality
        if (number_box.textContent == value) return;

        if (parseFloat(number_box.textContent) > value_f) {
            first_larger_number_box = number_box;
            break;
        }
    }

    // special case: if the new number is larger than anything we have,
    // `first_larger_number_box` will still be at null. We want to insert after
    // the last in that case
    if (!first_larger_number_box) { 
        container_el.lastChild.after(new_number_box(value, true));
    } else {
        first_larger_number_box.before(new_number_box(value, true));
    }

    custom_stamps.insert(value);
    custom_stamps.save();
}

const validate_stamp_value = val => /^\d{0,2}$/.test(val);
const validate_price_value = val => /^\d{0,3}$/.test(val);
function make_keypress_handler(validator) {
    return function on_keypress(e) {
        if (e.key != 'Enter') return;
        if (!validator(e.target.value)) return;

        let container_el = e.target.parentNode.parentNode;
        insert_new_value(container_el, e.target.value);
        // remove the <span> that we're in (the one with the input)
        e.target.parentNode.remove();
    }
}

function make_blur_handler(validator) {
    function on_blur(e) {
        // on blur, we only insert if it's valid, ofc
        if (validator(e.target.value))
            insert_new_value(e.target.parentNode.parentNode, e.target.value);
        e.target.parentNode.remove();
    }
}

// XXX this could be static, and then just shown/hidden when needed
function new_custom_val_number_box(kind) {
    let newel = document.createElement('span');
    let inp = document.createElement('input');
    // using type=tel instead of type=number, to not show arrows, but still
    // on mobile show keypad for typing numbers
    inp.type = 'tel';
    let pattern = '[0-9]{0,2}';
    let validator = validate_stamp_value;

    if (kind == 'price') {
        // price, so we should account for 3 digits
        pattern = '[0-9]{0,3}';
        validator = validate_price_value;
    }
    inp.pattern = pattern;
    inp.addEventListener('keypress', make_keypress_handler(validator));
    inp.addEventListener('blur', make_blur_handler(validator));
    newel.classList.add('number-box');
    newel.append(inp);
    return newel;
}

// Creates the initial <section> containing one <p> element with the price,
// and some text about the waiting.
function new_result_section_element(price) {
    const section = document.createElement('section');
    const p = document.createElement('p');
    const spinner = document.createElement('div');
    spinner.classList.add('spinner');

    // add class loading when we are showing the spinner
    p.classList.add('loading');
    p.append(price + ':', spinner);
    section.append(p);
    section.classList.add('price-result');
    section.dataset.price = price;
    section.dataset.numResults = 0;
    return section;
}





// user navigation
function go_forward(e) {
    // I kind of have to know which page we're on...
    switch (current_page) {
        case 'stamps':
            if (current_stamps_selected.length === 0) return;
            let next_page = small_screen ? 'prices' : 'results';
            show_page(next_page);
            break;
        case 'prices':
            show_page('results');
            break;
        case 'results':
            make_pdf();
            break;
        default:
            console.debug('ERROR 1');
    }
}

function go_back(e) {
    switch (current_page) {
        case 'stamps':
            reset_site();
            break;
        case 'prices':
            show_page('stamps');
            break;
        case 'results':
            reset_site();
        default:
            console.debug('ERROR 2');
            // TODO reset_site() probably not correct here
            reset_site();
    }
}


class UserStamps {
    constructor(key = 'saved_stamps') {
        this.key = key;
        this.arr = [];
        this.load();
    }

    // Completely resets the internal array, and reloads items from localStorage
    load() {
        this.arr.splice(0);
        let local_store_item = window.localStorage.getItem(this.key);
        if (local_store_item === null) return;
        let arr_of_strings = JSON.parse(local_store_item);
        let arr_of_ints = arr_of_strings.map(el => parseInt(el));

        this.arr.push(...arr_of_ints);
    }

    save() {
        window.localStorage.setItem(this.key, JSON.stringify(this.arr));
    }

    reset() {
        window.localStorage.removeItem(this.key);
        this.load();
    }

    insert(value) {
        if (this.arr.includes(value)) return;
        let idx = this.arr.findIndex(el => value < el);

        if (this.arr.length === 0 || idx === -1) {
            this.arr.push(value); return;
        } else {
            this.arr.splice(idx, 0, value);
        }
    }

    remove(value) {
        if (!this.arr.includes(value)) return;
        this.arr.splice(this.arr.indexOf(value), 1);
    }
}

// set the global "constants", and set click handlers
function initialize_app() {
    // We are downloading solutions.min.js in parallel, so we show the
    // activity icon here, to inform the user that a "background download"
    // is happening (the users at least sees that 'somethnig is going on')
    // TODO is this really necessary? Downloading a 400k file should take
    // far less time than the time it takes the user to start the first
    // calcuation process. Besides, I should already do check for the
    // existence of solutions_db (i.e. "solutions_db !== null") before I
    // try to use it anyway...
    show_activity_icon();
    mainEl = document.querySelector('main');
    custom_stamps = new UserStamps();
    small_screen = document.documentElement.clientWidth < 450;

    if (small_screen) {
        document.getElementById('forward_btn').textContent = 'Neste';
        document.querySelector('.dropdown-activator').addEventListener('click',
            show_menu);
    }
    document.getElementById('back_btn').addEventListener('click', go_back);
    document.getElementById('forward_btn').addEventListener('click', go_forward);
    document.querySelector('nav > h1').addEventListener('click', reset_site);
}


const hide_menu = () => document.getElementById('menu').classList.remove('open');
const show_menu = () => document.getElementById('menu').classList.add('open');

function reset_site() {
    // user clicked main header text. Reset the site completely
    hide_menu();

    // deselect any selected stamps (and also 'prices' if we are not
    // on mobile)
    get_selected('stamps', 'prices')
        .map(el => el.classList.remove('selected'));

    // clear out the internal array of selected items
    current_stamps_selected.splice(0)
    current_prices_selected.splice(0)

    // add deactivated class to both buttons
    change_button_state('back_btn', { add: ['deactivated'] });
    change_button_state('forward_btn', { add: ['deactivated'] });

    if (current_page != 'stamps') show_page('stamps');
}

function reset_saved_stamps() {
    custom_stamps.reset();
    show_toast('Alle frimerker nullstilt');
}

// Each pages' "init" routine
function onStampsPageShown() {
    let stamps_el = document.getElementById('stamps');
    stamps_el.firstElementChild.addEventListener('click', function(e) {
        let new_number_el = new_custom_val_number_box();
        stamps_el.children[0].after(new_number_el);

        // focus the input tag inside the span element
        new_number_el.children[0].focus();
    });

    // Add buttons for stamps, in sorted ascending order, with customs mixed in
    const def_stamps = [14, 15, 16, 17, 18, 19, 20, 21, 23, 38, 48]
        .map(stamp => ({value: stamp, custom: false}));
    const cust_stamps = custom_stamps.arr
        .map(stamp => ({value: stamp, custom: true}));

    let all_stamps = [...def_stamps, ...cust_stamps];
    all_stamps.sort((a, b) => a.value - b.value);
    all_stamps.forEach(s => stamps_el.append(new_number_box(s.value, s.custom)));

    // Finally mark the currently selected stamps
    let number_boxes = Array.from(stamps_el.children);
    for (let i = 0; i < current_stamps_selected.length; i++) {
        for (let j of number_boxes) {
            if (j.textContent == current_stamps_selected[i]) {
                j.classList.add('selected');
            }
        }
    }
}

function onPricesPageShown() {
    let prices_el = document.getElementById('prices');
    prices_el.firstElementChild.addEventListener('click', function(e) {
        let new_number_el = new_custom_val_number_box('price');
        prices_el.children[0].after(new_number_el);
    });

    // pn = "prices norway", pe = "prices europe", pw = "prices world"
    // se posten.no for oppdaterte priser
    let pn = [17, 24, 27, 45, 55, 88, 90, 100, 125, 135, 140, 175];
    let pe = [26, 31, 35, 59, 70, 115, 120, 130, 160, 180, 230];
    let pw = [32, 38, 43, 72, 90, 140, 145, 160, 200, 220, 225, 280];

    // this looks.. meh. All I'm doing is gathering all prices
    // into one array, make a set of it to remove duplicates,
    // sort them by integer value, and finally add them all to the DOM
    let prices = [...new Set([].concat(pn, pe, pw))].sort((x,y)=>x-y);
    prices.map(price => prices_el.append(new_number_box(price)));
}

function onResultsPageShown() {
    let ok = (current_stamps_selected.length > 0 &&
                current_prices_selected.length > 0);
    let msg = "Arrived on results page with 0 stamps OR 0 prices selected!"
    console.assert(ok, msg);
    if (!ok) return;

    const stamps_url_str = current_stamps_selected.join(',');
    const result_area_el = document.getElementById('result-area');

    // TODO change styling (make slightly smaller) for mobile
    let result_queries = [];

    show_activity_icon();
    current_prices_selected.forEach(price => {
        // create the result divs first, populate them with a
        // spinner, and wait for the results to come in
        const el = new_result_section_element(price);
        result_area_el.append(el);
        let db_response = emulate_calcapi_response(price, stamps_url_str);
        if (db_response) {
            display_result(el, db_response);
        } else {
            result_queries.push(
                call_calc_service(`?stamps=${stamps_url_str}&price=${price}`)
                .then(response => display_result(el, response))
                .catch(err => console.error('Calc-service fetch error', err))
            );
        }
    });
    Promise.allSettled(result_queries)
        .then(hide_activity_icon)
        .then(() => {
            change_button_state('forward_btn', { remove: ['deactivated'] });
        })
    ;
}


//
// Click and event handlers

window.addEventListener('DOMContentLoaded', function (e) {
    initialize_app();
    show_page('stamps');
});

function main_price_label_click(ev) {
    // find the associated <input> by reading the "for" attribute
    let id = ev.target.htmlFor;
    if (!id.startsWith('main')) return;
    let input_el = document.getElementById(id);

    // all <p>'s that belong to this price, should have their <input>s
    // "checked" attribute changed to reflect the parents status.
    // Remember that in the event handler, the current status of the "checked"
    // attribute needs to be inverted
    // array.slice(1) returns a new array without the first element
    Array.from(input_el.parentNode.parentNode.children)
        .slice(1)
        .map(p => { p.children[0].checked = !input_el.checked; });
}

function number_button_clicked(ev) {
    let stamps_btn = ev.target.parentNode.id == 'stamps';
    let val = parseInt(ev.target.textContent);

    let arr = stamps_btn ? current_stamps_selected : current_prices_selected;

    if (ev.target.classList.contains('selected')) {
        // not 100% sure this reduce always gives correct index, so therefore
        // the assert. (kinda tired when writing this..:)
        let idx = arr.reduce((acc, cur, idx) => cur < val ? idx : acc, -1);
        arr.splice(idx + 1, 0, val);
        console.assert(array_is_rising(arr), "array is not in ascending order!");
    } else {
        let idx = arr.indexOf(val);
        arr.splice(idx, 1);
    }

    // TODO correct buttons activated, and such
    let any_stamps = current_stamps_selected.length > 0;
    let any_prices = current_prices_selected.length > 0;
    if (small_screen) {
        if (stamps_btn) {
            if (arr.length) {
                change_button_state('back_btn', { remove: ['deactivated'] });
                change_button_state('forward_btn', { remove: ['deactivated'] });
            } else {
                change_button_state('back_btn', { add: ['deactivated'] });
                change_button_state('forward_btn', { add: ['deactivated'] });
            }
        } else {
            if (arr.length) {
                change_button_state('forward_btn', { remove: ['deactivated'] });
            } else {
                change_button_state('forward_btn', { add: ['deactivated'] });
            }
        }
    } else {
        if (!any_stamps && !any_prices) {
            // if BOTH sequences empty => []
            change_button_state('back_btn', { add: ['deactivated'] });
            change_button_state('forward_btn', { add: ['deactivated'] });
        } else if (logical_xor(any_stamps, any_prices)) {
            // if ONLY stamps seq non-empty => [cancel_btn]
            // if ONLY prices seq non-empty => [cancel_btn]
            // but NOT if they both apply! In other words, we want a logical
            // xor...!
            change_button_state('back_btn', { remove: ['deactivated'] });
        } else {
            // if BOTH seqs non-empty => [cancel_btn, forward_btn]
            change_button_state('back_btn', { remove: ['deactivated'] });
            change_button_state('forward_btn', { remove: ['deactivated'] });
        }
    }
}

function make_pdf() {
    change_button_state('forward_btn', {add:['clicked'], text:"Lager pdf..."});
    let request_body = { prices: [] }
    let sections = document.getElementById('result-area').children;
    for (let section of sections) {
        let nextobj = { price: section.dataset.price, lines: [] };
        for (let p of section.children) {
            // the first <p> tag inside a <section> is the "header", i.e.
            // the one with just text "XX:" inside the label
            if (p == section.firstChild) continue;
            if (!p.firstChild.checked) continue;
            nextobj.lines.push(p.children[1].textContent);
        }
        request_body.prices.push(nextobj);
    }

    show_activity_icon();
    call_pdf_service(JSON.stringify(request_body))
        .then(() => {
            btn.classList.remove('clicked');
            btn.classList.add('deactivated');
            btn.innerHTML = 'Pdf laget';
        })
        .then(hide_activity_icon)
        .catch(hide_activity_icon);
}







//
// API calling functions

// given a valid request body, call the pdf generator service, and return
// the blob of the pdf file
async function call_pdf_service(request_body) {
    let fetch_not_happening = false; // "stop trying to make 'fetch' happen!" :)
    let response;

    // To be able to abort the request, we need to use this mechanism
    let controller = new AbortController();
    let signal = controller.signal;
    const cancel_fetch = ev => { controller.abort(); };
    let back_button = document.getElementById('back_btn');
    back_button.addEventListener('click', cancel_fetch);
    
    // Also, pdf-creation sometimes takes a while, so we want to just notify
    // the user to be patient, in that case
    const slowTimer = window.setTimeout(() => {
        console.debug('took over 2.5 seconds');
        if (!fetch_not_happening) {
            show_toast('Serveren jobber ennå, gi den noen sekunder...');
        }
    }, 2500);

    try {
        response = await window.fetch(
            'https://pdfgen-dot-posten-frimerkekalkulator.appspot.com/',
            { method: 'POST', body: request_body, signal: signal }
        );
    } catch (e) {
        // XXX will this correctly check for an abort in all browsers?
        if (e.name == 'AbortError') {
            console.debug('Fetch to pdf-creation service was aborted by user');
        } else {
            console.debug('net error');
        }
        fetch_not_happening = true;
    } finally {
        back_button.removeEventListener('click', cancel_fetch);
    }

    window.clearInterval(slowTimer);

    if (fetch_not_happening) return;

    // blog.jayway.com/2017/07/13/open-pdf-downloaded-api-javascript/
    let blob_without_mimetype = await response.blob();
    let blob = new Blob([blob_without_mimetype], { type: 'application/pdf' });
    const data = window.URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = data;
    link.download = 'Frimerkekombinasjoner.pdf';
    link.click();
    setTimeout(function() {
        window.URL.revokeObjectURL(data);
    }, 100);
}

async function call_calc_service(query_string) {
    const api_url = 'https://calc-dot-posten-frimerkekalkulator.appspot.com/';
    const url = api_url + query_string;

    let response, json;
    try {
        response = await window.fetch(url);
    } catch (e) {
        if (e.name == 'AbortError') {
            console.debug('Fetch to calc-service aborted by user');
        } else {
            console.log('net error');
        }
    }

    try {
        json = await response.json();
    } catch(error) {
        console.log('Error on response.json():', error);
    }
    return json;
}
