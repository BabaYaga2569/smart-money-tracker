\# Coding Standards - Smart Money Tracker



\## Error Handling Standards



\### ✅ DO: Function-Scoped Variables for Error Logging



\*\*ALWAYS declare variables used in error handlers at function scope:\*\*



```javascript

app.post('/api/endpoint', async (req, res, next) => {

&nbsp; let userId = null;  // ✅ Function scope

&nbsp; let itemId = null;  // ✅ Function scope

&nbsp; 

&nbsp; try {

&nbsp;   userId = req.body.userId;

&nbsp;   itemId = req.body.itemId;

&nbsp;   

&nbsp;   // ... your logic here ...

&nbsp;   

&nbsp; } catch (error) {

&nbsp;   // ✅ These are ALWAYS accessible

&nbsp;   logger.error('Operation failed', error, { userId, itemId });

&nbsp;   next(error);

&nbsp; }

});

