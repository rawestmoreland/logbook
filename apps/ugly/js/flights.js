import { makeCell } from './helpers.js';
import { pb } from './pb-config.js';

const backButton = document.getElementById('page-back-btn');
const nextButton = document.getElementById('page-next-btn');

export function buildFlightsTable(
  flights,
  page = 1,
  hasMore = false,
  totalPages,
) {
  const backButton = document.getElementById('page-back-btn');
  const nextButton = document.getElementById('page-next-btn');

  if (flights.length === 0) {
    backButton.classList.add('hidden');
    nextButton.classList.add('hidden');
    return;
  }

  const tbody = document.querySelector('#flights-table tbody');

  const fragment = document.createDocumentFragment();

  for (const flight of flights) {
    const row = document.createElement('tr');

    row.appendChild(makeCell(flight.date));
    row.appendChild(
      makeCell(
        flight.aircraft_data?.model_data
          ? flight.aircraft_data.model_data.common_name ||
              flight.aircraft_data.model_data.model
          : '',
      ),
    );
    row.appendChild(makeCell(flight.aircraft_data?.tail_number));
    row.appendChild(makeCell(flight.route_from));
    row.appendChild(makeCell(flight.route_to));
    row.appendChild(makeCell(flight.total_time));
    row.appendChild(makeCell(flight.remarks));

    fragment.appendChild(row);
  }
  tbody.appendChild(fragment);
  if (hasMore) {
    nextButton.classList.remove('hidden');
  } else {
    nextButton.classList.add('hidden');
  }
  if (page > 1) {
    backButton.classList.remove('hidden');
  } else {
    backButton.classList.add('hidden');
  }
  document.getElementById('current-page').textContent = page;
  document.getElementById('total-pages').textContent = totalPages;
}

export async function fetchInitialFlights() {
  return await fetchPaginatedFlights();
}

export async function fetchPaginatedFlights(page = 1, perPage = 10) {
  let flights = [];
  let error = false;
  const result = await pb
    .collection('flights')
    .getList(page, perPage, {
      expand: 'aircraft, aircraft.model',
      sort: '-date',
    })
    .catch((error) => {
      console.error(error);
      return { error, flights };
    });

  if (result?.items?.length) {
    result.items.map((flight) => {
      flights.push({
        ...flight,
        aircraft_data: flight.expand?.aircraft
          ? {
              ...flight.expand.aircraft,
              model_data: flight.expand.aircraft.expand?.model
                ? flight.expand.aircraft.expand.model
                : null,
            }
          : null,
      });
    });
  }

  return {
    error,
    flights,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    hasMore: page === result.totalPages ? false : true,
  };
}

nextButton.addEventListener('click', function () {
  const params = new URLSearchParams(window.location.search);

  const page = params.get('page') ?? 1;

  params.set('page', Number(page) + 1);

  window.location.search = params.toString();
});

backButton.addEventListener('click', function () {
  const params = new URLSearchParams(window.location.search);

  const page = params.get('page');

  if (!page) {
    return;
  }

  params.set('page', Number(page) - 1);

  window.location.search = params.toString();
});
