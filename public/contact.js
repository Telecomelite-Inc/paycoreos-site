(function () {
  "use strict";
  var topic = document.querySelector('select[name="topic"]');
  var extra = document.getElementById("call-fields");
  if (!topic || !extra) return;
  var message = document.querySelector('textarea[name="message"]');
  var phone = document.querySelector('input[name="phone"]');
  var button = document.querySelector('#contact-form button[type="submit"]');

  function sync() {
    var call = topic.value === "call";
    extra.hidden = !call;
    extra.querySelectorAll("select").forEach(function (el) {
      el.required = call;
    });
    if (message) message.required = !call;
    if (phone) phone.required = call;
    if (button) button.textContent = call ? "Request a call" : "Send message";
  }

  topic.addEventListener("change", sync);
  sync();
})();
