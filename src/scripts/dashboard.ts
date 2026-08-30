function initDashboard() {

    const dashboardContent = document.getElementById('dashboardContent');
    const passwordForm = document.getElementById('passwordForm') as HTMLFormElement;
    const passwordError = document.getElementById('passwordError');
    const logoutBtn = document.getElementById('logoutBtn');

    // Password form
    if (passwordForm && passwordError) {
      passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(passwordForm);
        const password = formData.get('password') as string;

        try {
          const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });

          if (response.ok) {
            window.location.reload();
          } else {
            const data = await response.json();
            passwordError.textContent = data.error || 'Invalid password';
            passwordError.classList.remove('hidden');
          }
        } catch (error) {
          passwordError.textContent = 'An error occurred';
          passwordError.classList.remove('hidden');
        }
      });
    }

    // Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await fetch('/api/auth', { method: 'DELETE' });
        document.cookie = 'dashboard_auth=; Path=/; Max-Age=0';
        window.location.reload();
      });
    }

    // Only run dashboard logic if dashboard content is present
    if (dashboardContent) {
      const tabBtns = document.querySelectorAll('.tab-btn');
      const tabContents = document.querySelectorAll('.tab-content');
      const addItemForm = document.getElementById('addItemForm') as HTMLFormElement;
      const addCategoryForm = document.getElementById('addCategoryForm') as HTMLFormElement;
      const settingsForm = document.getElementById('settingsForm') as HTMLFormElement;

    // Tab switching
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => {
          b.classList.remove('bg-red-600', 'text-white');
          b.classList.add('bg-gray-800', 'text-gray-300');
        });
        btn.classList.remove('bg-gray-800', 'text-gray-300');
        btn.classList.add('bg-red-600', 'text-white');

        const tab = btn.getAttribute('data-tab');
        tabContents.forEach(content => {
          if (content.id === `${tab}Tab`) {
            content.classList.remove('hidden');
          } else {
            content.classList.add('hidden');
          }
        });
      });
    });
    // Initialize QR Code
    const qrCodeImage = document.getElementById('qrCodeImage') as HTMLImageElement;
    const downloadQrBtn = document.getElementById('downloadQrBtn') as HTMLAnchorElement;
    if (qrCodeImage && downloadQrBtn) {
      const publicUrl = window.location.origin;
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=' + encodeURIComponent(publicUrl) + '&margin=10';
      qrCodeImage.src = qrUrl;
      downloadQrBtn.href = qrUrl;
    }

    // Helper: create a menu item row element
    function createItemRow(item: any, categoryName: string) {
      const row = document.createElement('div');
      row.className = 'flex justify-between items-center bg-gray-800 p-3 rounded-md';
      row.setAttribute('data-item-id', item.id);

      const left = document.createElement('div');
      left.className = 'flex items-center gap-3';
      if (item.image) {
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;
        img.className = 'w-10 h-10 rounded object-cover';
        left.appendChild(img);
      }
      const info = document.createElement('div');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'text-white';
      nameSpan.textContent = item.name;
      const priceSpan = document.createElement('span');
      priceSpan.className = 'text-red-500 ml-2';
      priceSpan.textContent = `L ${parseFloat(item.price).toFixed(2)}`;
      info.appendChild(nameSpan);
      info.appendChild(priceSpan);
      left.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'flex gap-2';
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-item edit-item-btn text-blue-400 hover:text-blue-300';
      editBtn.setAttribute('data-id', item.id);
      editBtn.textContent = 'Edit';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-item delete-item-btn text-gray-400 hover:text-red-500';
      deleteBtn.setAttribute('data-id', item.id);
      deleteBtn.textContent = 'Delete';
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(left);
      row.appendChild(actions);
      return row;
    }

    // Helper: find or create the items container for a category
    function getCategoryContainer(categoryId: string, categoryName: string) {
      let found: HTMLElement | null = null;
      document.querySelectorAll('#menuItemsList > div').forEach((section: Element) => {
        const header = section.querySelector('h3');
        if (header && header.textContent === categoryName) {
          found = section.querySelector('div.space-y-2');
        }
      });
      if (found) return found;

      // Category section doesn't exist yet - create it
      const section = document.createElement('div');
      section.className = 'mb-6';
      const h3 = document.createElement('h3');
      h3.className = 'text-lg font-medium text-gray-300 mb-2';
      h3.textContent = categoryName;
      const container = document.createElement('div');
      container.className = 'space-y-2';
      section.appendChild(h3);
      section.appendChild(container);
      const menuList = document.getElementById('menuItemsList') as HTMLDivElement;
      menuList.appendChild(section);
      return container;
    }

    // Add item
    addItemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(addItemForm);
      let data: any = Object.fromEntries(formData);
      data.price = parseFloat(data.price as string);

      const errorDiv = document.getElementById('addItemError') as HTMLDivElement;

      try {
        // Optional image upload
        const fileInput = document.getElementById('itemImageUpload') as HTMLInputElement;
        const file = fileInput.files ? fileInput.files[0] : null;

        if (file) {
          const uploadFormData = new FormData();
          uploadFormData.append('file', file);
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: uploadFormData
          });
          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            data.image = uploadResult.url;
          } else {
            errorDiv.textContent = 'Image upload failed';
            errorDiv.classList.remove('hidden');
            return;
          }
        }

        const response = await fetch('/api/menu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          const item = await response.json();
          const categoryImg = document.querySelector(`#itemCategory option[value="${item.category_id}"]`);
          const categoryName = categoryImg ? categoryImg.textContent : 'Sin Categoría';
          const container = getCategoryContainer(item.category_id, categoryName ?? 'Sin Categoría');
          container.appendChild(createItemRow(item, categoryName ?? 'Sin Categoría'));
          addItemForm.reset();
          const fileNameEl = document.getElementById('itemImageFileName');
          if (fileNameEl) fileNameEl.textContent = 'No file chosen';
          errorDiv.classList.add('hidden');
        } else {
          const error = await response.json();
          errorDiv.textContent = error.error || 'Failed to add item';
          errorDiv.classList.remove('hidden');
        }
      } catch (error) {
        errorDiv.textContent = 'An error occurred';
        errorDiv.classList.remove('hidden');
      }
    });

    // Add category
    addCategoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(addCategoryForm);
      const data = Object.fromEntries(formData);

      try {
        const response = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          const category = await response.json();

          // Add to category list in sidebar
          const list = document.getElementById('categoriesList') as HTMLDivElement;
          const item = document.createElement('div');
          item.className = 'flex justify-between items-center bg-gray-800 p-2 rounded-md';
          const nameSpan = document.createElement('span');
          nameSpan.className = 'text-white';
          nameSpan.textContent = category.name;
          const delBtn = document.createElement('button');
          delBtn.className = 'delete-category delete-category-btn text-gray-400 hover:text-red-500';
          delBtn.setAttribute('data-id', category.id);
          delBtn.textContent = 'Delete';
          item.appendChild(nameSpan);
          item.appendChild(delBtn);
          list.appendChild(item);

          // Add to add-item and edit-item category selects
          const option = document.createElement('option');
          option.value = category.id;
          option.textContent = category.name;
          (document.getElementById('itemCategory') as HTMLSelectElement).appendChild(option);
          (document.getElementById('editItemCategory') as HTMLSelectElement).appendChild(option.cloneNode(true));

          addCategoryForm.reset();
        } else {
          const error = await response.json();
          alert(error.error || 'Failed to add category');
        }
      } catch (error) {
        alert('An error occurred');
      }
    });

    async function handleDeleteCategory(e: Event, btn?: HTMLElement) {
      const targetBtn = btn || (e.currentTarget as HTMLElement);
      const id = targetBtn.dataset.id;
      if (confirm('Delete this category?')) {
        const response = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });
        if (response.ok) {
          targetBtn.closest('[data-cat-id]')?.remove();
          document.querySelectorAll(`#itemCategory option[value="${id}"], #editItemCategory option[value="${id}"]`).forEach(op => op.remove());
          document.querySelectorAll(`#menuItemsList > div[data-category-id="${id}"]`).forEach(el => el.remove());
        }
      }
    }

    const menuItemsList = document.getElementById('menuItemsList') as HTMLDivElement;
    menuItemsList.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('button');
      if (!target) return;
      if (target.classList.contains('edit-item') || target.classList.contains('edit-item-btn')) {
        openEditModal(target.dataset.id);
      } else if (target.classList.contains('delete-item') || target.classList.contains('delete-item-btn')) {
        const id = target.dataset.id;
        if (confirm('Delete this item?')) {
          fetch(`/api/menu/${id}`, { method: 'DELETE' }).then(response => {
            if (response.ok) {
              const row = target.closest('[data-item-id]');
              row?.remove();
            }
          });
        }
      }
    });

    const categoriesSidebar = document.getElementById('categoriesList') as HTMLDivElement;
    categoriesSidebar.addEventListener('click', async (e) => {
      const target = (e.target as HTMLElement).closest('button');
      if (!target) return;
      
      if (target.classList.contains('delete-category-btn')) {
        handleDeleteCategory(e, target);
      } else if (target.classList.contains('move-category-btn')) {
        const id = target.dataset.id;
        const dir = target.dataset.dir;
        target.disabled = true;
        try {
          const response = await fetch('/api/categories', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, direction: dir })
          });
          if (response.ok) {
            window.location.reload(); // Recargar para mostrar el nuevo orden
          } else {
            target.disabled = false;
          }
        } catch(err) {
          target.disabled = false;
        }
      }
    });

    // Edit item (open modal)
    const editModal = document.getElementById('editModal') as HTMLDivElement;
    const editItemForm = document.getElementById('editItemForm') as HTMLFormElement;
    const editItemId = document.getElementById('editItemId') as HTMLInputElement;
    const editItemName = document.getElementById('editItemName') as HTMLInputElement;
    const editItemPrice = document.getElementById('editItemPrice') as HTMLInputElement;
    const editItemCategory = document.getElementById('editItemCategory') as HTMLSelectElement;
    const editItemImage = document.getElementById('editItemImage') as HTMLInputElement;
    const editItemImageUpload = document.getElementById('editItemImageUpload') as HTMLInputElement;
    const editItemDescription = document.getElementById('editItemDescription') as HTMLTextAreaElement;
    const editItemError = document.getElementById('editItemError') as HTMLDivElement;
    const editCancelBtn = document.getElementById('editCancelBtn') as HTMLButtonElement;

    async function openEditModal(id?: string) {
      if (!id) return;
      const response = await fetch('/api/menu');
      const items = await response.json();
      const item = items.find((i: any) => i.id === id);
      if (item) {
        editItemId.value = item.id;
        editItemName.value = item.name;
        editItemPrice.value = item.price;
        editItemCategory.value = item.category_id;
        editItemImage.value = item.image || '';
        editItemDescription.value = item.description || '';
        editItemImageUpload.value = '';
        const fileNameEl = document.getElementById('editItemFileName');
        if (fileNameEl) fileNameEl.textContent = 'No file chosen';
        editItemError.classList.add('hidden');
        editModal.classList.remove('hidden');
      }
    }

    // Edit modal cancel
    editCancelBtn.addEventListener('click', () => {
      editModal.classList.add('hidden');
    });

    // Edit item submit (with optional image upload)
    editItemForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let image = editItemImage.value;
      const file = editItemImageUpload.files ? editItemImageUpload.files[0] : null;

      try {
        if (file) {
          const formData = new FormData();
          formData.append('file', file);
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            image = uploadResult.url;
          } else {
            editItemError.textContent = 'Image upload failed';
            editItemError.classList.remove('hidden');
            return;
          }
        }

        const data = {
          name: editItemName.value,
          price: parseFloat(editItemPrice.value),
          category_id: editItemCategory.value,
          image,
          description: editItemDescription.value
        };

        const response = await fetch(`/api/menu/${editItemId.value}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          const updated = await response.json();
          editModal.classList.add('hidden');

          // Update the row in-place
          const row = document.querySelectorAll(`#menuItemsList [data-item-id="${editItemId.value}"]`)[0] as HTMLElement;
          if (row) {
            const oldCategoryId = (row.closest('[data-category-id]') as HTMLElement)?.dataset.categoryId;
            const newCategory = getCategoryContainer(updated.category_id, editItemCategory.selectedOptions[0]?.textContent || 'Sin Categoría');
            // Remove old row and append new row in correct category
            row.remove();
            newCategory.appendChild(createItemRow(updated, editItemCategory.selectedOptions[0]?.textContent || 'Sin Categoría'));
            if (oldCategoryId && oldCategoryId !== updated.category_id) {
              // Clean up empty old category section
              const oldSection = document.querySelector(`#menuItemsList > div[data-category-id="${oldCategoryId}"]`) as HTMLElement;
              if (oldSection && oldSection.querySelectorAll('[data-item-id]').length === 0) {
                oldSection.remove();
              }
            }
          }
        } else {
          const error = await response.json();
          editItemError.textContent = error.error || 'Failed to update item';
          editItemError.classList.remove('hidden');
        }
      } catch (error) {
        editItemError.textContent = 'An error occurred';
        editItemError.classList.remove('hidden');
      }
    });

    // Save settings
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(settingsForm);
      const data: any = Object.fromEntries(formData);
      const successDiv = document.getElementById('settingsSuccess') as HTMLDivElement;
      const errorDiv = document.getElementById('settingsError') as HTMLDivElement;

      try {
        // Optional logo upload
        const logoUpload = document.getElementById('settingsLogoUpload') as HTMLInputElement;
        const logoFile = logoUpload.files ? logoUpload.files[0] : null;

        if (logoFile) {
          const uploadFormData = new FormData();
          uploadFormData.append('file', logoFile);
          const uploadResponse = await fetch('/api/upload', {
            method: 'POST',
            body: uploadFormData
          });
          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            data.logo = uploadResult.url;
          } else {
            errorDiv.textContent = 'Logo upload failed';
            errorDiv.classList.remove('hidden');
            return;
          }
        }

        const response = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          successDiv.textContent = 'Settings saved!';
          successDiv.classList.remove('hidden');
          setTimeout(() => successDiv.classList.add('hidden'), 3000);
        } else {
          const error = await response.json();
          errorDiv.textContent = error.error || 'Failed to save settings';
          errorDiv.classList.remove('hidden');
        }
      } catch (error) {
        errorDiv.textContent = 'An error occurred';
        errorDiv.classList.remove('hidden');
      }
    });

    // File upload UI logic
    document.querySelectorAll('.file-upload-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const filenameId = target.getAttribute('data-filename-id');
        if (filenameId) {
          const nameDisplay = document.getElementById(filenameId);
          if (nameDisplay) {
            nameDisplay.textContent = target.files && target.files.length > 0 ? target.files[0].name : 'No file chosen';
          }
        }
      });
    });

    // Initialize
    // Live preview logic
    const settingsNameInput = document.getElementById('settingsName') as HTMLInputElement;
    const settingsPrimaryColorInput = document.getElementById('settingsPrimaryColor') as HTMLInputElement;
    const settingsSecondaryColorInput = document.getElementById('settingsSecondaryColor') as HTMLInputElement;
    const settingsTextColorInput = document.getElementById('settingsTextColor') as HTMLInputElement;
    const settingsLogoInput = document.getElementById('settingsLogo') as HTMLInputElement;
    const settingsLogoUploadInput = document.getElementById('settingsLogoUpload') as HTMLInputElement;
    const settingsLogoSizeInput = document.getElementById('settingsLogoSize') as HTMLInputElement;
    const logoSizeValue = document.getElementById('logoSizeValue') as HTMLSpanElement;

    const livePreviewContainer = document.getElementById('livePreviewContainer') as HTMLDivElement;
    const previewLogo = document.getElementById('previewLogo') as HTMLImageElement;
    const previewName = document.getElementById('previewName') as HTMLHeadingElement;
    const previewCategoryBorder = document.getElementById('previewCategoryBorder') as HTMLHeadingElement;
    const previewPrice = document.getElementById('previewPrice') as HTMLParagraphElement;
    const previewButton = document.getElementById('previewButton') as HTMLSpanElement;
    const formLogoPreview = document.getElementById('formLogoPreview') as HTMLImageElement;

    settingsLogoSizeInput.addEventListener('input', (e) => {
      const size = (e.target as HTMLInputElement).value;
      logoSizeValue.textContent = size;
      previewLogo.style.width = `${size}px`;
      previewLogo.style.height = `${size}px`;
    });

    settingsNameInput.addEventListener('input', (e) => {
      previewName.textContent = (e.target as HTMLInputElement).value || 'Restaurant Name';
    });

    const primaryColorLabel = document.getElementById('primaryColorLabel') as HTMLSpanElement;
    const secondaryColorLabel = document.getElementById('secondaryColorLabel') as HTMLSpanElement;
    const textColorLabel = document.getElementById('textColorLabel') as HTMLSpanElement;

    settingsPrimaryColorInput.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (primaryColorLabel) primaryColorLabel.textContent = color;
      previewCategoryBorder.style.borderColor = color;
      previewPrice.style.color = color;
      previewButton.style.backgroundColor = color;
      previewLogo.style.borderColor = color;
    });

    settingsSecondaryColorInput.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (secondaryColorLabel) secondaryColorLabel.textContent = color;
      livePreviewContainer.style.backgroundColor = color;
    });

    settingsTextColorInput.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      if (textColorLabel) textColorLabel.textContent = color;
      livePreviewContainer.style.color = color;
      // Also update the inactive filter text color to match the text color
      const inactiveFilter = livePreviewContainer.querySelector('span.opacity-70') as HTMLSpanElement;
      if (inactiveFilter) inactiveFilter.style.color = color;
    });

    function updateLogoPreview(src: string) {
      if (src) {
        if (previewLogo) {
          previewLogo.src = src;
          previewLogo.style.display = 'block';
        }
        if (formLogoPreview) {
          formLogoPreview.src = src;
          formLogoPreview.style.display = 'block';
        }
      } else {
        if (previewLogo) previewLogo.style.display = 'none';
        if (formLogoPreview) formLogoPreview.style.display = 'none';
      }
    }

    settingsLogoInput.addEventListener('input', (e) => {
      updateLogoPreview((e.target as HTMLInputElement).value);
    });

    settingsLogoUploadInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          updateLogoPreview(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    });

    }
  
}

initDashboard();
