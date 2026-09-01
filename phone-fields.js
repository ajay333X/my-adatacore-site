/* Country validation uses pinned libphonenumber-js 1.13.12 (max metadata). */
window.AdatacorePhone = (() => {
  function validate(country, raw) {
    const value = String(raw || '').trim();
    if (!country && !value) return { country: null, national: null, e164: null };
    if (!country || !value) throw new Error('Select a country and enter the phone number together.');
    if (!window.libphonenumber) throw new Error('Phone validation could not load. Please refresh and try again.');
    if (!/^[+\d\s().-]+$/.test(value)) throw new Error('Use digits, spaces, brackets or hyphens only.');
    const phone = libphonenumber.parsePhoneNumberFromString(value, { defaultCountry: country, extract: false });
    if (!phone || phone.ext || !phone.isValid() || phone.country !== country) {
      throw new Error('Enter a valid phone number for the selected country.');
    }
    return { country, national: phone.nationalNumber, e164: phone.number };
  }
  function mount(container, prefix = 'phone') {
    container.innerHTML = `<div class="phone-country-grid"><div><label class="field" for="${prefix}Country">Country / calling code</label><select id="${prefix}Country" class="input" autocomplete="country"><option value="">Select country</option></select></div><div><label class="field" for="${prefix}National">Phone number</label><input id="${prefix}National" class="input" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="40" placeholder="Enter your phone number" aria-describedby="${prefix}Help"></div></div><div id="${prefix}Help" class="phone-help" role="status">Choose the country your phone number belongs to.</div>`;
    const country = document.getElementById(prefix + 'Country'), number = document.getElementById(prefix + 'National'), help = document.getElementById(prefix + 'Help');
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    if (window.libphonenumber) {
      libphonenumber.getCountries().map(iso => ({iso,name:names.of(iso)})).sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>country.add(new Option(`${c.name} (+${libphonenumber.getCountryCallingCode(c.iso)})`,c.iso)));
    } else { help.textContent = 'Phone validation could not load. Please refresh.'; }
    let dirty = false;
    function preview() {
      try { const v=validate(country.value,number.value); help.textContent=v.e164?`International number: ${v.e164}`:'Choose the country your phone number belongs to.';number.setAttribute('aria-invalid','false'); }
      catch(e) { help.textContent=e.message;number.setAttribute('aria-invalid','true'); }
    }
    country.addEventListener('change',()=>{dirty=true;preview()});number.addEventListener('input',()=>{dirty=true;preview()});
    return {
      get() { return validate(country.value,number.value); },
      set(data,force=false) { if(dirty&&!force)return;country.value=data.phone_country_iso2||'';number.value=data.phone_national||'';dirty=false;preview(); },
      focus() { (!country.value?country:number).focus(); }
    };
  }
  return { validate, mount };
})();
