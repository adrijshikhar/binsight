package main

import (
	"fmt"
	"github.com/adrijshikhar/binsight/internal/adapter/mysqlbinlog"
	"strings"
)

const multiSQL = "# at 100\n#260603 11:42:01 server id 1  end_log_pos 200 CRC32 0x00000000 \tQuery\tthread_id=1\texec_time=0\terror_code=0\nCREATE TABLE foo (\n  id INT,\n  val VARCHAR(100)\n)/*!*/;\n"

func main() {
	evs, err := mysqlbinlog.ParseText(strings.NewReader(multiSQL), 0)
	if err != nil {
		fmt.Println("ERR:", err)
		return
	}
	fmt.Printf("events: %d\n", len(evs))
	if len(evs) == 1 && evs[0].Decoded != nil {
		fmt.Printf("SQL: %q\n", evs[0].Decoded.SQL)
	}
}
