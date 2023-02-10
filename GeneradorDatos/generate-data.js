import mysql from "mysql2/promise";
import cron from "node-cron";
const NOW = new Date(new Date().setSeconds(0));

/*Conexion base de datos*/
const pool = mysql.createPool({
    host: "db",
    user: "stocks",
    password: "stocks",
    database: "stocks",
    // connectionLimit: 10,
});



const companies = [
    "bbva",
    "santander",
    "repsol",
    "iberdrola",
    "inditex",
    "caixabank",
    "cellnex",
    "naturgy",
    "telefonica",
    "ferrovial",
];

const ids = [1,2,3,4,5,6,7,8,9,10];



/* Funcion que genera un variable aleatoria a partir del valor anterior generado.
    Se le pasa una variavle volatility para darle cierta dispersion a los datos 
    generados*/

const f = (old_price,volatility) => {
    const rnd = Math.random() - 0.498;
    const change_percent = 2 * volatility * rnd;
    const change_amount = old_price * change_percent;
    const new_price = old_price + change_amount;

    if (new_price < 0.01) return new_price + Math.abs(change_amount) * 2;
    else if (new_price > 1000) return new_price - Math.abs(change_amount) * 2;

    return new_price;
};
const getCompaniesCount = async () => {
    const con = await pool.getConnection();
    const [rows] = await con.query("SELECT COUNT(*) FROM empresas");
    con.release();
    return rows[0]["COUNT(*)"];
};

var anterior = [0,0,0,0,0,0,0,0,0,0];

const unfold = (seed, fn, n, id) => {
    let result = [];
    if(n != 1){
        for (let i = 0; i < n; i++) {
            result.push(seed);
            seed = fn(seed,0.02);
        }
        anterior[id-1]= seed;
        console.log(anterior)
    }else{
        for (let i = 0; i < n; i++) {
            anterior[id-1] = fn(anterior[id-1],0.02);
            result.push(anterior[id-1]);
            
        }
        console.log(anterior)
    }
    return result;
};

const ENTRIES_PER_COMPANY = 45000;

const generateData = (number,id) => unfold(100, f, number,id);

const generateCompanyData = (id,number) => {

    if(number != 1){
        return generateData(number,id).map((price, offset) => [
            id,
            price,
            substractMinutesFromDate(NOW, ENTRIES_PER_COMPANY - offset + 1),
        ]);
    }else{
        return generateData(number,id).map((price, offset) => [
            id,
            price,
            new Date(),
        ]);
    }
};

const substractMinutesFromDate = (date, minutes) => {
    return new Date(date.getTime() - minutes * 60000);
};

const withConnection = async (fn) => {
    try {
        const con = await pool.getConnection();
        await fn(con);
        con.release();
    } catch (e) {
        console.error(e)
    }
};

const insertCompanyData = async (id,number) => {
    const data = generateCompanyData(id,number);
    console.log(data)
    await withConnection(async (con) => {
        const query = `INSERT INTO historial_empresas (id_empresa, valor, fecha) VALUES ?`;
        await con.query(query, [data]);
        if(number == 1){
            const query1 = `update actuales set datos = ?, fecha = ? where id = ?`;
            data.forEach(async ele=>{
                await con.query(query1,[ele[1],ele[2],ele[0]]);
            })
        }
    });
};

/*Funcion que inserta el historico de datos*/
const insertCompaniesData = async (number) => {
    // const ids = companies.map((_, id) => id);
    const inserts = ids.map((id) => insertCompanyData(id,number));
    await Promise.all(inserts);
};

/* Funcion que inicializa con el primer dato*/
const inicializarDatos = async () =>{
    try {
        const con = await pool.getConnection();
        const query1 = `SELECT * FROM historial_empresas ORDER BY fecha DESC LIMIT 10`;
        const query2 = `update actuales set datos = ?, fecha = ? where id = ?`
        const [rows] = await con.query(query1);
        console.log(rows)
        rows.forEach(async ele=>{
            await con.query(query2,[ele.valor,ele.fecha,ele.id_empresa]);
            console.log("insertado en fila: "+ele.id_empresa);
        })

        con.release();
    } catch (e) {
        console.error(e)
    }
}


try {

    await insertCompaniesData(ENTRIES_PER_COMPANY);     //primero se genera el historial
    await inicializarDatos();                          //se inicaliza la tabla actuales
    cron.schedule("* * * * * ",() =>{                  //comienza el bucle de generar un dato cada minuto
        insertCompaniesData(1);                         
        console.log("insertado a fecha: " +new Date());
   });
} catch (e) {
    console.error(e)
}

