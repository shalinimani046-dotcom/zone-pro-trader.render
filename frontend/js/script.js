document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    lucide.createIcons();

    // Mobile Menu Toggle
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    if(mobileMenuButton && mobileMenu){
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });

        // Close mobile menu when clicking on a link
        const mobileMenuLinks = mobileMenu.querySelectorAll('a');
        mobileMenuLinks.forEach(link => {
            link.addEventListener('click', () => {
                setTimeout(() => {
                    mobileMenu.classList.add('hidden');
                }, 100);
            });
        });
    }
});
// Function to open the modal with the correct price
function openPayment_Modal(price) {
    const modal = document.getElementById('paymentModal');
    const priceDisplay = document.getElementById('modalPrice');
    priceDisplay.innerText = price;
    modal.classList.remove('hidden');
}

function closePayment_Modal() {
    document.getElementById('paymentModal').classList.add('hidden');
}


// Update your existing "Join Now" buttons to call this function
// Example: <button onclick="openPaymentModal('₹9,999')">Join Now</button>

// Handle Form Submission using EmailJS or a simple Formspree link
const form = document.getElementById('verificationForm');
if (form) {
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Create a WhatsApp message with the details (Easiest way for manual verification)
        const name = form.name.value;
        const email = form.email.value;
        const txn = form.txn_id.value;
        const price = document.getElementById('modalPrice').innerText;
    
        const message = `Hello Zone Pro Trader! I have made the payment.%0A%0A*Name:* ${name}%0A*Email:* ${email}%0A*Amount:* ${price}%0A*Txn ID:* ${txn}%0A%0A_Please verify and grant access._`;
        
        const whatsappUrl = `https://wa.me/919361241485?text=${message}`;
        
        // Redirect to WhatsApp
        window.open(whatsappUrl, '_blank');
        alert("Details submitted! Please send the message on WhatsApp to complete verification.");
    });
}
function showSwingScanner() {
    const ott = document.getElementById('ott-content');
    const swing = document.getElementById('swing-scanner-content');
    
    // Hide Option Trading Tools and Show Swing Scanner
    ott.classList.add('hidden');
    swing.classList.remove('hidden');
}

// Optional: Close scanner if clicking outside (if you want it to reset)
// Or you can add a 'back' button inside the Swing Scanner div if needed.