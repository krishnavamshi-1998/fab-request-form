'use client';

import React, { useState, useEffect, useRef } from 'react';

interface DropdownItem {
  name: string;
  stock: string | number;
}

interface FormItem {
  type: 'Tools' | 'Machine';
  itemName: string;
  quantity: string; 
}

export default function RequestForm() {
  const [formData, setFormData] = useState({
    supervisor: '',
    supervisorMobile: '',
    location: '',
    expectedReturn: '',
    issuedTo: 'Fabrication Dept', // Defaulting to Fabrication
  });

  const [department, setDepartment] = useState<'Fabrication' | 'Other'>('Fabrication');
  const [items, setItems] = useState<FormItem[]>([
    { type: 'Tools', itemName: '', quantity: '' }
  ]);

  const [supervisors, setSupervisors] = useState<string[]>([]);
  const [tools, setTools] = useState<DropdownItem[]>([]);
  const [machines, setMachines] = useState<DropdownItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: '', isError: false });

  const [supOpen, setSupOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState<{ [key: number]: boolean }>({});

  const [supSearch, setSupSearch] = useState('');
  const [itemSearch, setItemSearch] = useState<{ [key: number]: string }>({});

  const supervisorRef = useRef<HTMLDivElement>(null);
  const itemsRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Sync Department toggle selections straight into the issuedTo form data value string
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      issuedTo: department === 'Fabrication' ? 'Fabrication Dept' : ''
    }));
  }, [department]);

  // Fetch Dropdown Data & Handle Click Outside Closures
  useEffect(() => {
    async function fetchDropdownData() {
      try {
        const res = await fetch('/api/dropdowns');
        const json = await res.json();
        
        if (json.success) {
          setSupervisors(json.supervisors || []);
          
          const formattedTools = (json.tools || []).map((t: any) => 
            typeof t === 'string' ? { name: t, stock: 'Live' } : { name: t.name || '', stock: t.stock ?? 'Live' }
          );
          const formattedMachines = (json.machines || []).map((m: any) => 
            typeof m === 'string' ? { name: m, stock: 'Live' } : { name: m.name || '', stock: m.stock ?? 'Live' }
          );

          setTools(formattedTools);
          setMachines(formattedMachines);
        }
      } catch (err) {
        console.error('Failed to load form dropdowns:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDropdownData();

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.qty-container-block')) return;

      if (supervisorRef.current && !supervisorRef.current.contains(target)) {
        setSupOpen(false);
      }

      setItemOpen(prev => {
        const updated = { ...prev };
        let changed = false;
        Object.keys(itemsRefs.current).forEach((key) => {
          const index = Number(key);
          const rowRef = itemsRefs.current[index];
          if (updated[index] && rowRef && !rowRef.contains(target)) {
            updated[index] = false;
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSupervisors = supervisors.filter(name => 
    name.toLowerCase().includes(supSearch.toLowerCase())
  );

  const handleAddItemRow = () => {
    setItems([...items, { type: 'Tools', itemName: '', quantity: '' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
      const updatedSearch = { ...itemSearch };
      const updatedOpen = { ...itemOpen };
      delete updatedSearch[index];
      delete updatedOpen[index];
      setItemSearch(updatedSearch);
      setItemOpen(updatedOpen);
      delete itemsRefs.current[index];
    }
  };

  const updateItemField = (index: number, field: keyof FormItem, value: any) => {
    const updated = [...items];
    if (field === 'type') {
      updated[index] = { ...updated[index], type: value, itemName: '' };
      setItemSearch({ ...itemSearch, [index]: '' });
    } else if (field === 'quantity') {
      updated[index].quantity = value.replace(/[^0-9]/g, '');
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setItems(updated);
  };

  const handleStepQuantity = (index: number, direction: 'up' | 'down') => {
    const currentNum = parseInt(items[index].quantity, 10) || 0;
    if (direction === 'up') {
      updateItemField(index, 'quantity', String(currentNum + 1));
    } else {
      updateItemField(index, 'quantity', String(Math.max(1, currentNum - 1)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasInvalidQuantity = items.some(i => !i.quantity || parseInt(String(i.quantity), 10) <= 0);

    if (!formData.supervisor || !formData.supervisorMobile || !formData.issuedTo || items.some(i => !i.itemName)) {
      setMessage({ text: 'Please complete all required fields and item selections.', isError: true });
      return;
    }

    if (hasInvalidQuantity) {
      setMessage({ text: 'Please enter a valid quantity greater than 0.', isError: true });
      return;
    }

    setSubmitting(true);
    setMessage({ text: '', isError: false });

    const formattedItems = items.map(item => ({
      ...item,
      quantity: parseInt(String(item.quantity), 10)
    }));

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...formData, 
          items: formattedItems
        }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ text: 'Form logs saved successfully to Google Sheets!', isError: false });
        setFormData({ supervisor: '', supervisorMobile: '', location: '', expectedReturn: '', issuedTo: 'Fabrication Dept' });
        setDepartment('Fabrication');
        setSupSearch('');
        setItemSearch({});
        setItems([{ type: 'Tools', itemName: '', quantity: '' }]);
        itemsRefs.current = {};
      } else {
        setMessage({ text: `Submission Failed: ${data.error}`, isError: true });
      }
    } catch (err) {
      setMessage({ text: 'Internal transmission failure. Try again.', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center border-b pb-4">
          Fabrication Tracker Request Form
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            
            {/* SEARCHABLE SUPERVISOR DROPDOWN */}
            <div className="flex flex-col space-y-1 relative" ref={supervisorRef}>
              <label className="text-sm font-medium text-gray-700">Supervisor Name</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="🔍 Search & select supervisor..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  value={supSearch}
                  onFocus={() => setSupOpen(true)}
                  onChange={(e) => {
                    setSupSearch(e.target.value);
                    setSupOpen(true);
                    if (formData.supervisor) setFormData({ ...formData, supervisor: '' });
                  }}
                />
                {supOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md max-h-60 overflow-y-auto shadow-lg">
                    {filteredSupervisors.length === 0 ? (
                      <div className="p-2 text-sm text-gray-500">No supervisors found</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {filteredSupervisors.map((name, i) => (
                          <div
                            key={i}
                            className="p-2 text-sm hover:bg-blue-500 hover:text-white cursor-pointer transition-colors"
                            onClick={() => {
                              setFormData({ ...formData, supervisor: name });
                              setSupSearch(name);
                              setSupOpen(false);
                            }}
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* SUPERVISOR MOBILE NUMBER FIELD */}
            <div className="flex flex-col space-y-1">
              <label className="text-sm font-medium text-gray-700">Supervisor Mobile Number</label>
              <input
                type="tel"
                required
                placeholder="Enter mobile number"
                className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                value={formData.supervisorMobile}
                onChange={(e) => setFormData({ ...formData, supervisorMobile: e.target.value.replace(/[^0-9+ ]/g, '') })}
              />
            </div>

            {/* ISSUED TO DEPARTMENT TOGGLE ROW */}
            <div className="flex flex-col col-span-1 sm:col-span-2 bg-gray-50 p-4 rounded-md border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">Issued To</label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setDepartment('Fabrication')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all duration-150 ${
                    department === 'Fabrication' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Fabrication Dept
                </button>
                <button
                  type="button"
                  onClick={() => setDepartment('Other')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all duration-150 ${
                    department === 'Other' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Other Depts
                </button>
              </div>

              {department === 'Other' && (
                <input
                  type="text"
                  required
                  placeholder="Specify custom department or recipient name..."
                  className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  value={formData.issuedTo}
                  onChange={(e) => setFormData({ ...formData, issuedTo: e.target.value })}
                />
              )}
            </div>

            {/* LOCATION SITE */}
            <div className="flex flex-col space-y-1 col-span-1 sm:col-span-2">
              <label className="text-sm font-medium text-gray-700">Location / Site</label>
              <input
                type="text"
                required
                className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>

            {/* EXPECTED RETURN DATE */}
            <div className="flex flex-col space-y-1 col-span-1 sm:col-span-2">
              <label className="text-sm font-medium text-gray-700">Expected Return Date</label>
              <input
                type="date"
                required
                className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                value={formData.expectedReturn}
                onChange={(e) => setFormData({ ...formData, expectedReturn: e.target.value })}
              />
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* REQUESTED ITEMS SECTION */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Requested Items Checklist</h2>
            {loading ? (
              <div className="text-center text-sm text-gray-500 p-4">Loading active inventory dropdowns...</div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => {
                  const masterList = item.type === 'Tools' ? tools : machines;
                  const currentSearch = itemSearch[index] || '';
                  const isOpen = itemOpen[index] || false;
                  const filteredItems = masterList.filter(availItem =>
                    availItem.name.toLowerCase().includes(currentSearch.toLowerCase())
                  );
                  
                  return (
                    <div key={index} className="flex flex-col sm:flex-row gap-4 items-end bg-gray-50 p-4 rounded-md border border-gray-200 relative">
                      <div className="w-full sm:w-1/4 flex flex-col space-y-1">
                        <label className="text-xs font-medium text-gray-600">Category</label>
                        <select
                          className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          value={item.type}
                          onChange={(e) => updateItemField(index, 'type', e.target.value as any)}
                        >
                          <option value="Tools">Tools</option>
                          <option value="Machine">Machine</option>
                        </select>
                      </div>

                      <div className="w-full sm:w-2/4 flex flex-col space-y-1 relative" ref={(el) => { itemsRefs.current[index] = el; }}>
                        <label className="text-xs font-medium text-gray-600">Item Selection</label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder={`🔍 Search ${item.type.toLowerCase()}...`}
                            className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                            value={currentSearch}
                            onFocus={() => setItemOpen({ ...itemOpen, [index]: true })}
                            onChange={(e) => {
                              setItemSearch({ ...itemSearch, [index]: e.target.value });
                              setItemOpen({ ...itemOpen, [index]: true });
                              if (item.itemName) updateItemField(index, 'itemName', '');
                            }}
                          />
                          {isOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md max-h-60 overflow-y-auto shadow-lg">
                              {filteredItems.length === 0 ? (
                                <div className="p-2 text-sm text-gray-500">No matches found</div>
                              ) : (
                                <div className="divide-y divide-gray-100">
                                  {filteredItems.map((availItem, i) => (
                                    <div
                                      key={i}
                                      className="p-2 text-sm hover:bg-blue-500 hover:text-white cursor-pointer transition-colors"
                                      onClick={() => {
                                        updateItemField(index, 'itemName', availItem.name);
                                        setItemSearch({ ...itemSearch, [index]: availItem.name });
                                        setItemOpen({ ...itemOpen, [index]: false });
                                      }}
                                    >
                                      {availItem.name} <span className="text-xs opacity-80">(Stock: {availItem.stock})</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="w-full sm:w-1/4 flex flex-col space-y-1">
                        <label className="text-xs font-medium text-gray-600">Quantity</label>
                        <div className="qty-container-block flex items-center bg-white border border-gray-300 rounded-md h-[38px] overflow-hidden shadow-sm">
                          <button type="button" className="px-3 h-full bg-gray-100 hover:bg-gray-200" onClick={() => handleStepQuantity(index, 'down')}>-</button>
                          <input type="text" className="w-full text-center text-sm font-semibold outline-none bg-transparent" value={item.quantity} onChange={(e) => updateItemField(index, 'quantity', e.target.value)} />
                          <button type="button" className="px-3 h-full bg-gray-100 hover:bg-gray-200" onClick={() => handleStepQuantity(index, 'up')}>+</button>
                        </div>
                      </div>

                      {items.length > 1 && (
                        <button type="button" onClick={() => handleRemoveItemRow(index)} className="text-red-500 border border-red-200 bg-white rounded-md px-3 py-2 h-[38px]">Remove</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" onClick={handleAddItemRow} className="mt-3 text-sm text-blue-600 font-medium">+ Add Another Item Line</button>
          </div>

          {message.text && (
            <div className={`p-3 rounded-md text-sm font-medium ${message.isError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{message.text}</div>
          )}

          <button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-md text-sm disabled:bg-blue-400">
            {submitting ? 'Saving Logs...' : 'Submit Request Form'}
          </button>
        </form>
      </div>
    </main>
  );
}