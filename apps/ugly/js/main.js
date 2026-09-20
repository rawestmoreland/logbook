import { authWithOTP, isLoggedIn, requestOTP, signOut } from './auth.js';
import {
  buildFlightsTable,
  fetchInitialFlights,
  fetchPaginatedFlights,
} from './flights.js';

const loginForm = document.getElementById('login-form');
const otpForm = document.getElementById('otp-form');
const loginError = document.getElementById('login-error');
const otpError = document.getElementById('otp-error');
const loginView = document.getElementById('login-view');
const otpView = document.getElementById('otp-view');
const dashboardView = document.getElementById('dashboard-view');

const logoutBtn = document.getElementById('logout-btn');

let currentOtpId = null;

function showLoggedIn() {
  const queryString = window.location.search;
  const params = new URLSearchParams(queryString);
  const page = params.get('page');
  const hasMore = params.get('more');

  if (page === null && hasMore === null) {
    fetchInitialFlights()
      .then((result) => {
        console.log({ flightResponse: result });
        if (result.hasError) {
          buildFlightsTable([]);
        } else {
          buildFlightsTable(
            result.flights,
            1,
            result.hasMore,
            result.totalPages,
          );
        }
      })
      .catch((error) => {
        console.error(error);
      });
  } else {
    fetchPaginatedFlights(page)
      .then((result) => {
        console.log({ flightResponse: result });
        if (result.hasError) {
          buildFlightsTable([]);
        } else {
          buildFlightsTable(
            result.flights,
            page,
            result.hasMore,
            result.totalPages,
          );
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }

  loginView.classList.add('hidden');
  otpView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
}

function showOtpForm() {
  otpView.classList.remove('hidden');
  loginView.classList.add('hidden');
}

function showLoggedOut() {
  dashboardView.classList.add('hidden');
  otpView.classList.add('hidden');
  loginView.classList.remove('hidden');
  loginForm.reset();
  flights = [];
}

function handleOtpRequestSubmit(event) {
  event.preventDefault();
  loginError.classList.add('hidden');

  const email = document.getElementById('email').value;

  requestOTP(email)
    .then((result) => {
      console.log({ result });
      currentOtpId = result.otpId;
      showOtpForm();
    })
    .catch((err) => {
      loginError.textContent = 'Could not send a code to this email address.';
      loginError.classList.remove('hidden');
      console.error(err);
    });
}

function handleLoginRequestSubmit(event) {
  event.preventDefault();
  otpError.classList.add('hidden');

  const code = document.getElementById('otp').value;

  authWithOTP(currentOtpId, code)
    .then(() => {
      showLoggedIn();
    })
    .catch((err) => {
      otpError.textContent = 'Invalid or expired code.';
      otpError.classList.remove('hidden');
    });
}

function handleLogoutClick() {
  signOut();
  showLoggedOut();
}

loginForm.addEventListener('submit', function (event) {
  console.log('Requesting OTP...');
  handleOtpRequestSubmit(event);
});

otpForm.addEventListener('submit', function (event) {
  handleLoginRequestSubmit(event);
});

logoutBtn.addEventListener('click', function () {
  handleLogoutClick();
});

if (isLoggedIn()) {
  showLoggedIn();
} else {
  showLoggedOut();
}
