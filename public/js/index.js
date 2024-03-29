// import synaptic from 'synaptic';
import Dygraph from './dygraphs/dygraph';
import textCsvToJSON from './textCsvToJSON';
import Frequencies from './Frequencies';
import TestWallet from './TestWallet';
// import createNetwork from './createNetwork';
import KeyboardMap from './KeyboardMap';
import RSI from './RSI';
import MA from './MA';
import createSeriesUpsAndDownsDataSet, { createSeriesUpsAndDowns } from './createSeriesUpsAndDownsDataSet';

const selectExchange = document.getElementById('trade-exchange');
const selectSymbol = document.getElementById('trade-symbol');
const selectTradeDate = document.getElementById('trade-date');

console.log({ io });
const connection = io('ws://localhost:3000', { transports: ['websocket'] });
connection.on('connect', () => {
  connection.on('reload', () => {
    window.location.reload();
  });
  connection.on('public-chart-data-update', () => {
    fetchWithSelectInput();
  });
  connection.on('getExchangeList', initExchanges);
  connection.emit('getExchangeList');
  connection.on('getExchangeCurrencySymbols', (list) => {
    updateExchangeSymbolsList(list);
    subscribeExchangeSymbol();
  });
  connection.on('generateDatabase', ({ message, error }) => {
    generateDatabaseContainer.dataset.inProgress = 'false';
    updateDisabledGenerateButton();

    if (error) {
      generateInfo.dataset.type = 'error';
      generateInfo.innerHTML = JSON.stringify(error);
      return;
    }

    generateInfo.dataset.type = 'success';
    generateInfo.innerHTML = message;
  });
});
connection.onmessage = (data) => { console.log(data); };

const {
  Neuron, Layer, Trainer, Network,
} = synaptic;
// import testNetwork from './testNetwork';

// testNetwork();


const DEFAULT_ADD_TO_CHART_BUTTON = 'Control';

let selectionId = 0;
const chartScrollbarInput = document.querySelector('.chart-scrollbar > input');

/**
 * @param list
 */
function initExchanges(list) {
  resetSelectInput(selectExchange, list.sort(), { initValue: selectExchange.value });
  connection.emit('getExchangeCurrencySymbols', selectExchange.value);
}

/**
 * @param select
 * @param list
 */
function resetSelectInput(select, list, { initValue = null, defaultFirst = true } = {}) {
  const currentOptionIndex = select.selectedIndex;
  const currentOption = select[currentOptionIndex];
  while (select.firstElementChild) {
    select.firstElementChild.remove();
  }

  list.forEach((data) => {
    const option = document.createElement('option');
    option.value = data;
    option.innerHTML = data;
    select.append(option);
  });

  if (currentOptionIndex !== -1) {
    const selectArr = [...select];
    const theSameValueOption = selectArr.find(option => option.value === currentOption.value);
    if (theSameValueOption) {
      select.value = theSameValueOption.value;
      return;
    }
  }

  if (list.includes(initValue)) {
    select.value = initValue;
    return;
  }
  const defaultIndex = (defaultFirst ? 0 : select.length - 1);
  select.value = select[defaultIndex]?.value;
}

/**
 * @param list
 */
function updateExchangeSymbolsList(list) {
  resetSelectInput(selectSymbol, list.sort(), { initValue: selectSymbol.value });
  processSymbolDataUrls({
    symbol: selectSymbol.value,
    exchange: selectExchange.value,
  });
}

/**
 *
 */
function processSymbolDataUrls({ symbol, exchange }) {
  getSymbolDataUrls({ symbol, exchange }).then(({ dates, symbol, exchange }) => {
    console.log('symbol data done');

    // console.log('--BEFORE--');
    // console.log({
    //   dates, symbol, exchange, options: [...selectTradeDate].map(option => option.value),
    // });
    resetSelectInput(selectTradeDate, dates, {
      initValue: selectTradeDate.value,
      defaultFirst: false,
    });
    // console.log('--AFTER--');
    // console.log({
    //   dates, symbol, exchange, options: [...selectTradeDate].map(option => option.value),
    // });
    fetchFromDate(({ date: selectTradeDate.value, symbol, exchange })).then(() => {
      trainNetwork();
      runFunc();
    }).catch(() => {});
  });
}

selectTradeDate.addEventListener('change', fetchWithSelectInput);

selectExchange.addEventListener('change', (event) => {
  const { target } = event;
  connection.emit('getExchangeCurrencySymbols', target.value);
});

selectSymbol.addEventListener('change', () => {
  previousMonth = '';
  processSymbolDataUrls({
    symbol: selectSymbol.value,
    exchange: selectExchange.value,
  });
  subscribeExchangeSymbol();
});

/**
 *
 */
function subscribeExchangeSymbol() {
  connection.emit('subscribeExchangeSymbol', {
    exchange: selectExchange.value,
    symbol: selectSymbol.value,
  });
}

const generateDatabaseContainer = document.querySelector('.generate-database-container');
const generateDatabaseButton = generateDatabaseContainer.querySelector('button[name="generate-database"]');
const generateSymbolInput = generateDatabaseContainer.querySelector('input[name="generate-symbol"]');
const generateInfo = generateDatabaseContainer.querySelector('.generate-database-info');

generateDatabaseButton.addEventListener('click', (event) => {
  event.preventDefault();
  const { target } = event;

  connection.emit('generateDatabase', {
    exchange: selectExchange.value,
    symbol: generateSymbolInput.value,
  });
  generateDatabaseContainer.dataset.inProgress = 'true';
  generateDatabaseButton.disabled = true;
});

generateSymbolInput.addEventListener('input', () => {
  if (generateDatabaseContainer.dataset.inProgress !== 'true') {
    updateDisabledGenerateButton();
  }
});
updateDisabledGenerateButton();
/**
 *
 */
function updateDisabledGenerateButton() {
  generateDatabaseButton.disabled = (generateSymbolInput.value.length === 0);
}

/**
 * @param chart
 */
function chartSelectionEvent(chart) {
  if (KeyboardMap.isPressed(DEFAULT_ADD_TO_CHART_BUTTON)) return;

  selectionId = chart.getSelection();
  this.forEach((ch) => {
    if (ch !== chart) {
      ch.setSelection(selectionId);
    }
  });
}

/**
 * @param chart
 */
function chartZoomEvent(chart) {
  chart.resetZoom();
  chartDrawEvent(chart);
}

/**
 * @param chart
 */
function chartClickEvent(chart) {
  if (!KeyboardMap.isPressed(DEFAULT_ADD_TO_CHART_BUTTON)) return;

  const { offsetX, offsetY } = event;
  const { canvas_: canvas } = chart;
  const xAxisRange = chart.xAxisRange();
  const yAxisRange = chart.yAxisRange();

  const canvasXFloatValue = offsetX / canvas.width;
  const canvasYFloatValue = offsetY / canvas.height;
  const xSpan = xAxisRange[1] - xAxisRange[0];
  const ySpan = yAxisRange[1] - yAxisRange[0];
  const chartX = xSpan * canvasXFloatValue + xAxisRange[0];
  const chartY = yAxisRange[1] - (ySpan * canvasYFloatValue);

  chart.marks.push({ x: chartX, y: chartY, color: 'green' });
  chartDrawEvent(chart);
}

/**
 * @param chart
 */
function chartDrawEvent(chart) {
  const RECT_SIZE = 10;

  const { canvas_: canvas, canvas_ctx_: ctx } = chart;
  const xAxisRange = chart.xAxisRange();
  const yAxisRange = chart.yAxisRange();
  const xSpan = xAxisRange[1] - xAxisRange[0];
  const ySpan = yAxisRange[1] - yAxisRange[0];

  chart.marks.forEach((mark) => {
    if (mark.x >= xAxisRange[0] && mark.x <= xAxisRange[1]
        && mark.y >= yAxisRange[0] && mark.y <= yAxisRange[1]) {
      const canvasXPx = ((mark.x - xAxisRange[0]) / xSpan) * canvas.width;
      const canvasYPx = canvas.height - ((mark.y - yAxisRange[0]) / ySpan) * canvas.height;
      ctx.save();
      ctx.fillStyle = mark.color;
      ctx.fillRect(canvasXPx, canvasYPx, RECT_SIZE, RECT_SIZE);
      ctx.restore();
    }
  });
}

class ChartGroup extends Array {
  push(...args) {
    args.forEach((arg) => {
      const chart = arg.getChart();
      super.push(chart);

      this.initMarks();
      this.initRequestAnimationFrame();
    });
  }

  initMarks() {
    this.forEach((chart) => {
      chart.marks = [];
    });
  }

  initRequestAnimationFrame() {
    /**
     *
     */
    const drawAllCharts = () => {
      this.forEach(chartDrawEvent);
    };
    window.addEventListener('mousemove', () => {
      requestAnimationFrame(drawAllCharts);
    });
  }

  bind() {
    this.forEach((chart) => {
      chart.updateOptions({
        highlightCallback: chartSelectionEvent.bind(this, chart),
        zoomCallback: chartZoomEvent.bind(null, chart),
        clickCallback: chartClickEvent.bind(null, chart),
        drawCallback: chartDrawEvent.bind(null, chart),
      });
    });
  }
}

let runFunc = null;
let startSelectionId = null;
let endSelectionId = null;
const customInteractionModel = {
  ...Dygraph.defaultInteractionModel,
  dblclick: () => {
    zoomSize = DEFAULT_ZOOM;
    index = Math.max(index, zoomSize);

    updateChartScrollbar();
    runFunc();
  },
  mousedown: (event, g, context) => {
    Dygraph.defaultInteractionModel.mousedown(event, g, context);
    startSelectionId = selectionId;
  },
  mouseup: () => {
    endSelectionId = selectionId;
    const diff = Math.abs(endSelectionId - startSelectionId);
    if (diff === 0) return;

    const scrollbarValue = Number.parseInt(chartScrollbarInput.value, 10);
    const furtherSelectionId = Math.max(startSelectionId, endSelectionId);
    const oldZoomSize = zoomSize;
    const newIndex = furtherSelectionId + scrollbarValue - oldZoomSize;
    zoomSize = diff;
    index = Math.max(newIndex, zoomSize);

    updateChartScrollbar();
    runFunc();
  },
};

/**
 *
 */
function updateChartScrollbar() {
  chartScrollbarInput.setAttribute('min', zoomSize);
  chartScrollbarInput.value = index;
}

/**
 * @param {number[]} xAxisRange
 * @returns {number}
 */
// function getNumRowsWithAxisRange(xAxisRange) {
//   return Math.floor((xAxisRange[1] - xAxisRange[0]) / (1000 * 60 * 5)) + 1;
// }

const DEFAULT_ZOOM = 288 * 7;
let zoomSize = DEFAULT_ZOOM;
let index = zoomSize;

const chartDataContainers = document.querySelectorAll('.chart-canvas');
const priceChart = new Chart(chartDataContainers[0]);
const frequencyChart = new Chart(chartDataContainers[1]);
const chartGroup = new ChartGroup();
chartGroup.push(priceChart, frequencyChart);
chartGroup.bind();
const priceChartDataUpdater = new DataUpdater();
const frequencyChartDataUpdater = new DataUpdater();
const frequencies = new Frequencies();

const period = 288;
/**
 *
 */
function fetchWithSelectInput() {
  const options = {
    date: selectTradeDate.value,
    symbol: selectSymbol.value,
    exchange: selectExchange.value,
  };
  return fetchFromDate(options).then(() => {
    clearTimeout(timeout);
    setTimeout(() => {
      timeout = null;

      trainNetwork();
      runFunc();
    }, 100);
  });
}

let previousMonth = '';

// localStorage.removeItem('network');


let scrollHasOnInput = false;
let preparedData = null;

/**
 * @param {string} date format: YYYY-MM
 * @returns {Promise}
 */
async function fetchFromDate({ date, symbol, exchange }) {
  if (!date) throw new Error('Nie ma okresów dla tej pary');
  return fetch(`/data/${exchange}/${symbol}/${date}.json`, {
    mode: 'cors',
  }).then(res => res.json()).then((json) => {
    const priceJson = createPriceJson(json);
    priceChartDataUpdater.setJSONData(priceJson);
    const frequencyJson = createPriceJson(json);
    frequencyChartDataUpdater.setJSONData(frequencyJson);

    const oldValue = chartScrollbarInput.value;
    const oldMax = chartScrollbarInput.getAttribute('max');
    chartScrollbarInput.setAttribute('min', zoomSize);
    chartScrollbarInput.setAttribute('max', json.length);

    if (previousMonth !== selectTradeDate.value) {
      previousMonth = selectTradeDate.value;
      index = json.length;
      chartScrollbarInput.value = index;
    } else if (oldValue === oldMax) {
      index = json.length;
      chartScrollbarInput.value = index;
    }

    if (!scrollHasOnInput) {
      chartScrollbarInput.addEventListener('input', (event) => {
        const { target } = event;
        index = Number.parseInt(target.value, 10);
        run();
      });

      scrollHasOnInput = true;
    }

    /**
     *
     */
    function run() {
      const jsonPriceFragment = preparedData.priceJson.slice(index - zoomSize, index);
      priceChart.updateData(jsonPriceFragment);
      const jsonFrequencyFragment = preparedData.frequencyJson.slice(index - zoomSize, index);
      frequencyChart.updateData(jsonFrequencyFragment);
    }
    runFunc = run;

    return {
      priceJson,
      frequencyJson,
      run,
    };
  }).then(({ priceJson, frequencyJson, run }) => {
    const options = {
      inputSize: 2,
      outputSize: 1,
      period,
    };
    return ({
      dataSet: createSeriesUpsAndDownsDataSet(priceJson, options),
      copyDataSet: createSeriesUpsAndDownsDataSet(priceJson, options),
      priceJson,
      frequencyJson,
      run,
      options,
    });
  })
    .then((data) => {
      preparedData = data;
      data.run();
    });
}

/**
 * @param sizes
 */
function createNetwork(...sizes) {
  const network = new synaptic.Architect.LSTM(2, 4, 1);
  const neurons = network.neurons();
  neurons.forEach((neuron) => {
    neuron.neuron.squash = Neuron.squash.TANH;
  });
  return network;
}

let network = null;
let timeout = null;
let lastTransationResult = 0;
/**
 * @param dataSet
 */
function trainNetwork({
  dataSet, copyDataSet, frequencyJson, options,
} = preparedData) {
  const data = new FormData();
  data.append('json', JSON.stringify(dataSet));
  console.log({ dataSet });
  fetch('/upload',
    {
      method: 'POST',
      body: JSON.stringify(dataSet),
      headers: {
        'Content-Type': 'application/json',
      },
    }).then(res => res);

  const lastError = null;
  lastTransationResult = 0;
  /**
   *
   */
  function testNetwork() {
    const lowPercent = 0.68;
    const highPercent = 1;
    let isSell = true;
    let bitcoin = 0;
    let dolar = 100;
    console.log('xxxxxxxxxxxxxxxxxx');
    let max = -1;
    const transactions = [];
    frequencyChartDataUpdater.setJSONData(preparedData.frequencyJson);
    frequencyChartDataUpdater.addProperty('wzrost', (id, json_) => {
      if (id < period) return null;
      if (id > frequencyJson.length - period) return null;
      const input = createSeriesUpsAndDowns(json_, id, options.inputSize, period);
      const output = network.activate(input);
      output.forEach((out) => {
        if (out > max) {
          max = out;
        }
      });
      // if (max > 0) throw new Error('Wartosci znów są poniżej zera');
      const positiveOutputIsBetween = output[0] >= max * lowPercent && output[0] <= max * highPercent;
      const negativeOutputIsBetween = output[0] >= max * (1 + highPercent) && output[0] <= max * (1 + lowPercent);

      if (output[0] === Math.max(...output) && (max > 0 ? positiveOutputIsBetween : negativeOutputIsBetween)) {
        transactions[id] = { trade: 'buy', price: json_[id].close };
        return priceChartDataUpdater.json[id].close;
      }
      // transactions[id] = { trade: 'node', price: json_[id].close };
      return null;
    });
    let min = 0;
    frequencyChartDataUpdater.addProperty('spadek', (id, json_) => {
      if (id < period) return null;
      if (id > frequencyJson.length - period) return null;
      const input = createSeriesUpsAndDowns(json_, id, options.inputSize, period);
      const output = network.activate(input);
      output.forEach((out) => {
        if (out < min) {
          min = out;
        }
      });
      if (min > 0) throw new Error('error');
      if (output[0] === Math.min(...output) && output[0] <= min * lowPercent && output[0] >= min * highPercent) {
        transactions[id] = { trade: 'sell', price: json_[id].close };
        return priceChartDataUpdater.json[id].close;
      }
      // transactions[id] = { trade: 'node', price: json_[id].close };
      return null;
    });
    isSell = true;
    let operationsCount = 0;
    let lastDolarsCount = 0;
    dolar = 100;
    bitcoin = 0;
    let sum = 0;
    transactions.forEach(({ trade, price }) => {
      if (!isSell && trade === 'sell') {
        isSell = true;
        dolar = bitcoin * price;
        sum += dolar - lastDolarsCount;
        lastDolarsCount = dolar;
        bitcoin = 0;
        operationsCount += 1;
      } else if (isSell && trade === 'buy') {
        isSell = false;
        bitcoin = dolar / price;
        // operationsCount += 1;
      }
    });
    // if (!isSell) {
    //   dolar = bitcoin * transactions[transactions.length - 1].price;
    //   sum += dolar - lastDolarsCount;
    //   bitcoin = 0;
    //   operationsCount += 1;
    // }

    const average = operationsCount ? (sum - 100) / (operationsCount) : 0;
    // console.log({
    //   dolar, bitcoin, operationsCount, average,
    // });
    console.log({
      dolar, bitcoin, operationsCount, average,
    });
    if (average > lastTransationResult && operationsCount > 5 && average > 2) {
      console.log('good', {
        dolar, bitcoin, operationsCount, average,
      });
      lastTransationResult = average;
      localStorage.setItem('network', JSON.stringify(network.toJSON()));
      jsonText = localStorage.getItem('network');
      network = Network.fromJSON(JSON.parse(jsonText));
    } else {
      jsonText = localStorage.getItem('network');
      network = Network.fromJSON(JSON.parse(jsonText));
    }
  }
  let jsonText = localStorage.getItem('network');
  if (jsonText) {
    network = Network.fromJSON(JSON.parse(jsonText));
  } else {
    network = createNetwork(4, 16, 4);
  }
  testNetwork();
  /**
   *
   */
  async function trainFail() {
    if (!timeout) return;

    const trainer = new Trainer(network);

    if (Math.random() < 0.5) network = createNetwork(4, 16, 4);

    trainer.train(dataSet, {
      rate: Math.random() * 0.2 * Math.random() + Math.random() * 0.8 * Math.random() / 10,
      iterations: 100,
      error: 0.005,
      shuffle: Math.random() > 0.3,
      log: 0,
      cost: Trainer.cost.MSE,
    });

    testNetwork();
    preparedData.run();
    timeout = setTimeout(trainFail, 10);
  }
  // localStorage.removeItem('network');
  jsonText = localStorage.getItem('network');
  if (jsonText) {
    network = Network.fromJSON(JSON.parse(jsonText));
    // lastBalance = getBalance(network, copyDataSet, wallet);
  } else {
    network = createNetwork(4, 16, 4);
    localStorage.setItem('network', JSON.stringify(network.toJSON()));
  }
  trainFail();
  // console.log(getBalance(network, copyDataSet, wallet));
}

/**
 * @param json
 */
function createPriceJson(json) {
  // const copy = JSON.parse(JSON.stringify(json));
  const copy = json.map(({ time, close }) => ({ time, close }));
  repairTime(copy);
  return copy;
}

/**
 * @param {{time:string}[]} json
 */
function repairTime(json) {
  json.forEach((record) => {
    Object.assign(record, { time: new Date(record.time) });
  });
}

/**
 * @param {HTMLElement} node
 */
function Chart(node) {
  let data = [[0]];
  let labels = ['index'];
  const chart = new Dygraph(node, data, {
    labels,
    legend: 'always',
    digitsAfterDecimal: 5,
    interactionModel: customInteractionModel,
  });
  this.updateData = (json) => {
    if (json.length === 0) throw new Error('Pusty JSON');
    labels = Object.keys(json[0]);
    data = [];
    for (let i = 0; i < json.length; i += 1) {
      const obj = json[i];
      const record = [];
      labels.forEach(label => record.push(obj[label]));
      data.push(record);
    }
    try {
      chart.updateOptions({
        file: data,
        labels,
      });
    } catch (e) {
      console.error({ data });
    }
  };
  /**
   *
   * @returns {Dygraph}
   */
  this.getChart = () => chart;
}


/**
 *
 */
function DataUpdater() {
  this.setJSONData = (json) => {
    this.json = json;
  };
  this.addProperty = (name, updater = updateDataFunction) => {
    this.json.forEach((record, id) => {
      Object.assign(record, { [name]: updater(id, this.json) });
    });
  };

  this.removeProperty = (name) => {
    this.json.forEach((record) => {
      const r = record;
      delete r[name];
    });
  };
}

/**
 * @param {number} id
 * @param {JSON} json
 * @returns {number | null}
 */
function updateDataFunction(id, json) {
  return id && json && null;
}

/**
 * @param {string} symbol
 * @returns {string[]} urls
 */
async function getSymbolDataUrls({ symbol, exchange }) {
  if (!symbol) throw new Error('You must set SYMBOL');
  const resolve = await fetch(`/data/${exchange}/${symbol}/list.json`);
  const json = await resolve.json();
  return { dates: json, symbol, exchange };
}

// -----------------------------------
const pauseButton = document.querySelector('button[name="pause"]');
pauseButton.addEventListener('click', (event) => {
  event.preventDefault();
  clearTimeout(timeout);
  timeout = null;
});

const testButton = document.querySelector('button[name="test"]');
testButton.addEventListener('click', (event) => {
  event.preventDefault();
  clearTimeout(timeout);
  timeout = null;
  lastTransationResult = 0;

  trainNetwork();
});

const trainButton = document.querySelector('button[name="train"]');
trainButton.addEventListener('click', (event) => {
  event.preventDefault();
  clearTimeout(timeout);
  timeout = Number.MAX_SAFE_INTEGER;

  trainNetwork();
});

const createNewButton = document.querySelector('button[name="create-new"]');
createNewButton.addEventListener('click', (event) => {
  event.preventDefault();
  clearTimeout(timeout);
  timeout = null;

  network = createNetwork();
  localStorage.setItem('network', JSON.stringify(network.toJSON()));
  lastTransationResult = 0;
});
